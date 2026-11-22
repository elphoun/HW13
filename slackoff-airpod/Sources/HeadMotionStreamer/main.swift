import Foundation
import CoreMotion
import MediaPlayer

// Usage: HeadMotionStreamer [--port 9000] [--bot-port 9001] [--bot-host h] [--csv motion.csv] [--quiet] [--stem] [--host 192.168.1.20] [--player 2]
//   --host      send to another computer running the bridge (default 127.0.0.1). Use this on the second laptop.
//   --port      the web game's bridge (default 9000).
//   --bot-port  the Slack bot's motion listener (default 9001, 0 = off). Every packet goes to both, so the game and
//               the bot can run at the same time. --bot-host defaults to --host.
//   --player  which player this AirPod controls (1 or 2...). The game page opened with ?p=N listens to that player.
//   --stem  forward AirPod stem presses (play/pause/next/previous) to the game as a jump button.
//           Takes over media controls while running.
var port: UInt16 = 9000
var botPort: UInt16 = 9001
var botHost: String?
var csvPath: String?
var quiet = false
var stem = false
var host = "127.0.0.1"
var player = 1
var args = Array(CommandLine.arguments.dropFirst())
while let a = args.first {
    args.removeFirst()
    switch a {
    case "--port": if let v = args.first, let p = UInt16(v) { port = p; args.removeFirst() }
    case "--csv": if let v = args.first { csvPath = v; args.removeFirst() }
    case "--quiet": quiet = true
    case "--stem": stem = true
    case "--host": if let v = args.first { host = v; args.removeFirst() }
    case "--bot-port": if let v = args.first, let p = UInt16(v) { botPort = p; args.removeFirst() }
    case "--bot-host": if let v = args.first { botHost = v; args.removeFirst() }
    case "--player": if let v = args.first, let p = Int(v) { player = p; args.removeFirst() }
    default: print("Unknown arg \(a)"); exit(2)
    }
}

// One unconnected UDP socket, sendto() each destination. Unconnected sockets ignore "port unreachable" errors,
// so a destination with nothing listening (game or bot not running) never disturbs the other.
let sock = socket(AF_INET, SOCK_DGRAM, 0)
func resolve(_ h: String, _ p: UInt16) -> sockaddr_in? {
    var hints = addrinfo(ai_flags: 0, ai_family: AF_INET, ai_socktype: SOCK_DGRAM, ai_protocol: 0,
                         ai_addrlen: 0, ai_canonname: nil, ai_addr: nil, ai_next: nil)
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
print("Status: \(CMHeadphoneMotionManager.authorizationStatus().rawValue) (3 = authorized). Streaming UDP -> game \(host):\(port)\(botPort != 0 ? ", Slack bot \(botHost ?? host):\(botPort)" : "") as player \(player). Ctrl+C to stop.")

manager.startDeviceMotionUpdates(to: .main) { motion, error in
    if let error = error { print("Error: \(error.localizedDescription)"); return }
    guard let m = motion else { return }
    let t = m.timestamp
    let a = m.attitude, ua = m.userAcceleration, r = m.rotationRate, g = m.gravity
    let json = "{\"p\":\(player)," + String(format: "\"t\":%.4f,\"roll\":%.4f,\"pitch\":%.4f,\"yaw\":%.4f,\"ax\":%.4f,\"ay\":%.4f,\"az\":%.4f,\"rx\":%.4f,\"ry\":%.4f,\"rz\":%.4f,\"gx\":%.4f,\"gy\":%.4f,\"gz\":%.4f}",
                      t, a.roll, a.pitch, a.yaw, ua.x, ua.y, ua.z, r.x, r.y, r.z, g.x, g.y, g.z)
    send(json)
    csv?.write((String(format: "%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f\n",
                       t, a.roll, a.pitch, a.yaw, ua.x, ua.y, ua.z, r.x, r.y, r.z, g.x, g.y, g.z)).data(using: .utf8)!)
    if !quiet {
        print(String(format: "\rroll %6.1f°  pitch %6.1f°  | acc x %5.2f y %5.2f z %5.2f   ",
                     a.roll * 180 / .pi, a.pitch * 180 / .pi, ua.x, ua.y, ua.z), terminator: "")
        fflush(stdout)
    }
}
// AirPod stem press -> {"type":"button"} packet. macOS routes stem presses to the "now playing" app as media commands.
if stem {
    let cc = MPRemoteCommandCenter.shared()
    for (name, cmd) in [("toggle", cc.togglePlayPauseCommand), ("play", cc.playCommand), ("pause", cc.pauseCommand),
                        ("next", cc.nextTrackCommand), ("previous", cc.previousTrackCommand)] {
        cmd.isEnabled = true
        cmd.addTarget { _ in
            send("{\"p\":\(player),\"type\":\"button\",\"src\":\"\(name)\"}")
            if !quiet { print("\nstem press (\(name)) -> jump") }
            return .success
        }
    }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = [MPMediaItemPropertyTitle: "AirPod Wipeout"]
    MPNowPlayingInfoCenter.default().playbackState = .playing
    print("Stem presses -> jump (media controls are captured while this runs).")
}
RunLoop.main.run()
