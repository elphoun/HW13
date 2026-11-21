import Foundation
import CoreMotion
import Network

// Usage: HeadMotionStreamer [--port 9000] [--csv motion.csv] [--quiet]
var port: UInt16 = 9000
var csvPath: String?
var quiet = false
var args = Array(CommandLine.arguments.dropFirst())
while let a = args.first {
    args.removeFirst()
    switch a {
    case "--port": if let v = args.first, let p = UInt16(v) { port = p; args.removeFirst() }
    case "--csv": if let v = args.first { csvPath = v; args.removeFirst() }
    case "--quiet": quiet = true
    default: print("Unknown arg \(a)"); exit(2)
    }
}

let udp = NWConnection(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!, using: .udp)
udp.start(queue: .global())

var csv: FileHandle?
if let path = csvPath {
    FileManager.default.createFile(atPath: path, contents: nil)
    csv = FileHandle(forWritingAtPath: path)
    csv?.write("t,roll,pitch,yaw,ax,ay,az,rx,ry,rz,gx,gy,gz\n".data(using: .utf8)!)
}

let manager = CMHeadphoneMotionManager()
final class Delegate: NSObject, CMHeadphoneMotionManagerDelegate {
    func headphoneMotionManagerDidConnect(_ m: CMHeadphoneMotionManager) { print("AirPods connected") }
    func headphoneMotionManagerDidDisconnect(_ m: CMHeadphoneMotionManager) { print("AirPods disconnected") }
}
let delegate = Delegate()
manager.delegate = delegate

guard manager.isDeviceMotionAvailable else {
    print("Headphone motion unavailable. Need AirPods Pro/Max/3rd gen connected and in your ears.")
    exit(1)
}
print("Status: \(CMHeadphoneMotionManager.authorizationStatus().rawValue) (3 = authorized). Streaming UDP -> 127.0.0.1:\(port). Ctrl+C to stop.")

manager.startDeviceMotionUpdates(to: .main) { motion, error in
    if let error = error { print("Error: \(error.localizedDescription)"); return }
    guard let m = motion else { return }
    let t = m.timestamp
    let a = m.attitude, ua = m.userAcceleration, r = m.rotationRate, g = m.gravity
    let json = String(format: "{\"t\":%.4f,\"roll\":%.4f,\"pitch\":%.4f,\"yaw\":%.4f,\"ax\":%.4f,\"ay\":%.4f,\"az\":%.4f,\"rx\":%.4f,\"ry\":%.4f,\"rz\":%.4f,\"gx\":%.4f,\"gy\":%.4f,\"gz\":%.4f}",
                      t, a.roll, a.pitch, a.yaw, ua.x, ua.y, ua.z, r.x, r.y, r.z, g.x, g.y, g.z)
    udp.send(content: json.data(using: .utf8), completion: .idempotent)
    csv?.write((String(format: "%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f\n",
                       t, a.roll, a.pitch, a.yaw, ua.x, ua.y, ua.z, r.x, r.y, r.z, g.x, g.y, g.z)).data(using: .utf8)!)
    if !quiet {
        print(String(format: "\rroll %6.1f°  pitch %6.1f°  | acc x %5.2f y %5.2f z %5.2f   ",
                     a.roll * 180 / .pi, a.pitch * 180 / .pi, ua.x, ua.y, ua.z), terminator: "")
        fflush(stdout)
    }
}
RunLoop.main.run()
