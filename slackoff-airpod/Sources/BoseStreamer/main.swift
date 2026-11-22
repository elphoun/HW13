import Foundation
import CoreBluetooth

// BoseStreamer: reads the motion sensor in Bose QuietComfort 35 II / Headphones 700 / Frames over Bluetooth Low Energy and sends
// the same UDP packets HeadMotionStreamer sends for AirPods, so the bridge, web app and Slack bot work unchanged.
// EXPERIMENTAL: written from the Bose AR protocol docs, not yet tried on real headphones.
//
// Usage: BoseStreamer [--scan] [--raw] [--name QC35] [--period 40] [--host 127.0.0.1] [--port 9000] [--bot-port 9001] [--bot-host h] [--player 1] [--quiet]
//   --scan     list nearby Bluetooth LE devices for 10 s and exit (use it to see whether your headphones show up)
//   --raw      print every accelerometer / gyroscope reading instead of the roll / pitch line
//   --name     only connect to a device whose name contains this (default: the first device offering the Bose AR service)
//   --period   sensor period in ms: 20, 40, 80, 160 or 320 (default 40 = 25 Hz)
var host = "127.0.0.1", botHost: String?, port: UInt16 = 9000, botPort: UInt16 = 9001
var player = 1, periodMs: UInt16 = 40, nameFilter = "", scanOnly = false, raw = false, quiet = false
var args = Array(CommandLine.arguments.dropFirst())
while let a = args.first {
    args.removeFirst()
    switch a {
    case "--scan": scanOnly = true
    case "--raw": raw = true
    case "--quiet": quiet = true
    case "--name": if let v = args.first { nameFilter = v.lowercased(); args.removeFirst() }
    case "--period": if let v = args.first, let p = UInt16(v), [20, 40, 80, 160, 320].contains(p) { periodMs = p; args.removeFirst() } else { print("--period must be 20, 40, 80, 160 or 320"); exit(2) }
    case "--host": if let v = args.first { host = v; args.removeFirst() }
    case "--port": if let v = args.first, let p = UInt16(v) { port = p; args.removeFirst() }
    case "--bot-port": if let v = args.first, let p = UInt16(v) { botPort = p; args.removeFirst() }
    case "--bot-host": if let v = args.first { botHost = v; args.removeFirst() }
    case "--player": if let v = args.first, let p = Int(v) { player = p; args.removeFirst() }
    default: print("Unknown arg \(a)"); exit(2)
    }
}

// One unconnected UDP socket, sendto() each destination (same approach as HeadMotionStreamer).
let sock = socket(AF_INET, SOCK_DGRAM, 0)
func resolve(_ h: String, _ p: UInt16) -> sockaddr_in? {
    var hints = addrinfo(ai_flags: 0, ai_family: AF_INET, ai_socktype: SOCK_DGRAM, ai_protocol: 0, ai_addrlen: 0, ai_canonname: nil, ai_addr: nil, ai_next: nil)
    var res: UnsafeMutablePointer<addrinfo>?
    guard getaddrinfo(h, String(p), &hints, &res) == 0, let r = res else { print("Cannot resolve \(h)"); return nil }
    defer { freeaddrinfo(res) }
    return r.pointee.ai_addr.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee }
}
var dests: [sockaddr_in] = []
if let d = resolve(host, port) { dests.append(d) }
if botPort != 0, let d = resolve(botHost ?? host, botPort) { dests.append(d) }
func send(_ text: String) {
    let bytes = Array(text.utf8)
    for var d in dests {
        _ = withUnsafePointer(to: &d) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
            sendto(sock, bytes, bytes.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
    }
}

final class Bose: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    let service = CBUUID(string: "0000FDD2-0000-1000-8000-00805F9B34FB")
    let configUUID = CBUUID(string: "5AF38AF6-000E-404B-9B46-07F77580890B")
    let dataUUID = CBUUID(string: "56A72AB8-4988-4CC8-A752-FBD1D54A953D")
    var central: CBCentralManager!
    var peripheral: CBPeripheral?
    var config: CBCharacteristic?
    var configured = false
    var scanningAll = false
    var seen = Set<UUID>()
    var filter = HeadFilter()
    var accel: V3?, gyro: V3?
    var t = 0.0, packets = 0

    override init() { super.init(); central = CBCentralManager(delegate: self, queue: nil) }

    func centralManagerDidUpdateState(_ c: CBCentralManager) {
        switch c.state {
        case .poweredOn: begin()
        case .unauthorized: print("Bluetooth permission denied. Allow your terminal in System Settings > Privacy & Security > Bluetooth, then run again.")
        case .poweredOff: print("Bluetooth is off. Turn it on and run again.")
        case .unsupported: print("This Mac has no Bluetooth LE.")
        default: break
        }
    }

    func begin() {
        if scanOnly { print("Scanning for 10 s…"); startScan(all: true); DispatchQueue.main.asyncAfter(deadline: .now() + 10) { print("Done."); exit(0) }; return }
        if let known = central.retrieveConnectedPeripherals(withServices: [service]).first(where: { match($0.name) }) {
            print("Found already-connected \(known.name ?? "device"), connecting…"); connect(known); return
        }
        print("Scanning for a Bose AR device (turn the headphones on and keep them close)…")
        startScan(all: false)
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [self] in
            guard peripheral == nil else { return }
            print("Nothing offering the Bose AR service yet. Also trying by name… (run with --scan to see what's around)")
            startScan(all: true)
        }
    }

    func match(_ name: String?) -> Bool { nameFilter.isEmpty || (name?.lowercased().contains(nameFilter) ?? false) }
    func startScan(all: Bool) {
        scanningAll = all; central.stopScan()
        central.scanForPeripherals(withServices: all ? nil : [service], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
    }

    func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral, advertisementData: [String: Any], rssi: NSNumber) {
        let name = (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? p.name
        if scanOnly {
            if seen.insert(p.identifier).inserted {
                let svcs = (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID])?.map(\.uuidString).joined(separator: ",") ?? ""
                print(String(format: "  %-28@ rssi %4d  %@", (name ?? "(no name)") as NSString, rssi.intValue, svcs as NSString))
            }
            return
        }
        let looksBose = (name?.lowercased().contains("bose") ?? false) || (name?.lowercased().contains("qc") ?? false)
        guard peripheral == nil, nameFilter.isEmpty ? (!scanningAll || looksBose) : match(name) else { return }
        print("Found \(name ?? "device"), connecting…"); connect(p)
    }

    func connect(_ p: CBPeripheral) { peripheral = p; p.delegate = self; central.stopScan(); central.connect(p) }
    func centralManager(_ c: CBCentralManager, didConnect p: CBPeripheral) { print("Connected. Looking for the motion service…"); p.discoverServices([service]) }
    func centralManager(_ c: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) { print("Connect failed: \(error?.localizedDescription ?? "?")"); retry(p) }
    func centralManager(_ c: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) { print("\nDisconnected. Reconnecting…"); configured = false; retry(p) }
    func retry(_ p: CBPeripheral) { DispatchQueue.main.asyncAfter(deadline: .now() + 2) { self.central.connect(p) } }

    func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        guard let s = p.services?.first(where: { $0.uuid == service }) else { print("This device doesn't offer the Bose AR motion service (FDD2). Services: \(p.services?.map(\.uuid.uuidString) ?? [])"); return }
        p.discoverCharacteristics(nil, for: s)
    }
    func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
        for ch in s.characteristics ?? [] {
            if ch.uuid == dataUUID { p.setNotifyValue(true, for: ch) }
            if ch.uuid == configUUID { config = ch; p.readValue(for: ch) }
        }
        if config == nil { print("Motion service found, but no sensor configuration characteristic. Is the headphone firmware up to date (btu.bose.com)?") }
    }
    func peripheral(_ p: CBPeripheral, didUpdateValueFor ch: CBCharacteristic, error: Error?) {
        if let error = error { print("Read error: \(error.localizedDescription)"); return }
        guard let value = ch.value else { return }
        if ch.uuid == configUUID {
            guard !configured else { return }
            configured = true
            // Turn on the accelerometer (0) and gyroscope (1) at the chosen period, keeping every other entry as the device reports it.
            let out = boseConfigData(current: value, enable: [0, 1], periodMs: periodMs)
            print("Sensor config now: \([UInt8](value)) -> writing \([UInt8](out)) (\(1000 / Int(periodMs)) Hz)")
            p.writeValue(out, for: ch, type: ch.properties.contains(.write) ? .withResponse : .withoutResponse)
        } else if ch.uuid == dataUUID { handle(value) }
    }
    func peripheral(_ p: CBPeripheral, didWriteValueFor ch: CBCharacteristic, error: Error?) {
        print(error.map { "Config write failed: \($0.localizedDescription)" } ?? "Sensors enabled. Streaming UDP -> game \(host):\(port)\(botPort != 0 ? ", Slack bot \(botHost ?? host):\(botPort)" : "") as player \(player). Ctrl+C to stop.")
    }

    func handle(_ data: Data) {
        for r in parseBoseSensorData(data) {
            guard let v = r.vector else { continue }
            if raw { print(String(format: "%@ ts %5d  % .3f % .3f % .3f", r.sensor == 0 ? "accel" : "gyro ", Int(r.timestamp), v.x, v.y, v.z)) }
            if r.sensor == 1 { gyro = v; continue }
            guard let g = gyro else { continue }                       // a packet per accelerometer reading, using the latest gyro
            let dt = Double(periodMs) / 1000; t += dt
            let s = filter.update(accelBose: v, gyroBoseDps: g, dt: dt)
            send("{\"p\":\(player)," + String(format: "\"t\":%.4f,\"roll\":%.4f,\"pitch\":%.4f,\"yaw\":%.4f,\"ax\":%.4f,\"ay\":%.4f,\"az\":%.4f,\"rx\":%.4f,\"ry\":%.4f,\"rz\":%.4f,\"gx\":%.4f,\"gy\":%.4f,\"gz\":%.4f}",
                                         t, s.roll, s.pitch, s.yaw, s.userAccel.x, s.userAccel.y, s.userAccel.z, s.rotationRate.x, s.rotationRate.y, s.rotationRate.z, s.gravity.x, s.gravity.y, s.gravity.z))
            packets += 1
            if !quiet && !raw {
                print(String(format: "\rroll %6.1f°  pitch %6.1f°  yaw %6.1f°  | packets %d   ", s.roll * 180 / .pi, s.pitch * 180 / .pi, s.yaw * 180 / .pi, packets), terminator: "")
                fflush(stdout)
            }
        }
    }
}

let bose = Bose()
RunLoop.main.run()
