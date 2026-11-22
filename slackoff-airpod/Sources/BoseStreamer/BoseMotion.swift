import Foundation

// Bose AR motion protocol (QuietComfort 35 II, Headphones 700, Frames) and the math that turns it into the same
// numbers HeadMotionStreamer sends for AirPods. Protocol facts come from the community reverse-engineered
// Bose AR BLE docs and Bose's archived SDK docs; nothing here has been checked against real hardware yet.
//
//   Bose device frame: +X toward the wearer's right, +Y toward the back, +Z toward the body (so up = -Z).
//   Accelerometer: g, INCLUDING the pull of gravity (a still, upright head reads about (0, 0, -1)).
//   Gyroscope: degrees per second about those axes.
//   Our "head frame" (what CoreMotion headphones use): x right, y up, z back. Bose -> head is (x, -z, y), a pure rotation.

typealias V3 = (x: Double, y: Double, z: Double)

func add(_ a: V3, _ b: V3) -> V3 { (a.x + b.x, a.y + b.y, a.z + b.z) }
func sub(_ a: V3, _ b: V3) -> V3 { (a.x - b.x, a.y - b.y, a.z - b.z) }
func mul(_ a: V3, _ k: Double) -> V3 { (a.x * k, a.y * k, a.z * k) }
func dot(_ a: V3, _ b: V3) -> Double { a.x * b.x + a.y * b.y + a.z * b.z }
func cross(_ a: V3, _ b: V3) -> V3 { (a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x) }
func length(_ a: V3) -> Double { dot(a, a).squareRoot() }
func normalized(_ a: V3) -> V3 { let l = length(a); return l > 1e-9 ? mul(a, 1 / l) : (0, 1, 0) }
func boseToHead(_ v: V3) -> V3 { (v.x, -v.z, v.y) }

// MARK: - Packets

/// One sensor reading from a sensorData notification. Only the accelerometer (id 0) and gyroscope (id 1) carry a vector.
struct BoseRecord { let sensor: UInt8; let timestamp: UInt16; let vector: V3? }

/// A notification is a run of records: [sensorId u8][timestamp u16 big-endian][sample].
/// Sample sizes: accelerometer / gyroscope 7 (three int16 / 4096, then an accuracy byte), rotation 10, game rotation 8.
func parseBoseSensorData(_ data: Data) -> [BoseRecord] {
    let b = [UInt8](data)
    var out: [BoseRecord] = [], i = 0
    func i16(_ o: Int) -> Double { Double(Int16(bitPattern: UInt16(b[o]) << 8 | UInt16(b[o + 1]))) / 4096 }
    while i + 3 <= b.count {
        let id = b[i], ts = UInt16(b[i + 1]) << 8 | UInt16(b[i + 2])
        let size: Int
        switch id { case 0, 1: size = 7; case 2: size = 10; case 3: size = 8; default: return out }   // unknown id: stop, can't know its size
        guard i + 3 + size <= b.count else { return out }
        out.append(BoseRecord(sensor: id, timestamp: ts, vector: id <= 1 ? (i16(i + 3), i16(i + 5), i16(i + 7)) : nil))
        i += 3 + size
    }
    return out
}

/// The sensor configuration characteristic is a list of 3-byte entries [sensorId u8][samplePeriodMs u16 big-endian]; period 0 = off.
/// Starts from what the device reports now, sets the wanted sensors to `periodMs` and leaves the rest alone.
func boseConfigData(current: Data, enable ids: [UInt8], periodMs: UInt16) -> Data {
    let b = [UInt8](current)
    var entries: [(id: UInt8, period: UInt16)] = []
    if b.count % 3 == 0 { for i in stride(from: 0, to: b.count, by: 3) { entries.append((b[i], UInt16(b[i + 1]) << 8 | UInt16(b[i + 2]))) } }
    for id in ids {
        if let k = entries.firstIndex(where: { $0.id == id }) { entries[k].period = periodMs } else { entries.append((id, periodMs)) }
    }
    return Data(entries.flatMap { [$0.id, UInt8($0.period >> 8), UInt8($0.period & 0xff)] })
}

// MARK: - Head tracking

struct HeadSample { var roll, pitch, yaw: Double; var userAccel, rotationRate, gravity: V3 }

/// Turns accelerometer + gyroscope into roll / pitch / yaw, gravity, and linear acceleration, like CMDeviceMotion does for AirPods.
/// Gravity direction: a complementary filter (gyro for the fast part, the accelerometer pulling it back when it reads about 1 g).
/// Yaw: the gyro rate about "up", integrated, with a bias estimate learned while the head is still. It drifts, so the exercise code
/// only uses yaw relative to where you started.
struct HeadFilter {
    var up: V3 = (0, 1, 0)           // world "up" in head-frame coordinates
    var haveUp = false
    var yaw = 0.0, yawBias = 0.0, still = 0.0
    var pull = 0.05                  // how hard the accelerometer corrects gravity per sample
    var accelSign = -1.0             // CoreMotion's userAcceleration has the opposite sign of true acceleration (see sensor.js)

    mutating func update(accelBose: V3, gyroBoseDps: V3, dt: Double) -> HeadSample {
        let a = boseToHead(accelBose), w = mul(boseToHead(gyroBoseDps), .pi / 180)
        if !haveUp { if length(a) > 0.5 { up = normalized(a); haveUp = true } }
        up = normalized(sub(up, mul(cross(w, up), dt)))                    // the world turns by -w relative to the head
        let m = length(a)
        if abs(m - 1) < 0.15 { up = normalized(add(mul(up, 1 - pull), mul(a, pull / m))) }   // trust the accelerometer when not accelerating hard
        let g = mul(up, -1)
        let roll = atan2(g.x, -g.y), pitch = asin(max(-1, min(1, g.z)))     // roll + = right ear down, pitch - = nodding forward
        let rate = dot(w, up)                                               // + = turning left
        if length(w) < 0.05 { still += dt; if still > 1 { yawBias += (rate - yawBias) * 0.02 } } else { still = 0 }
        yaw += (rate - yawBias) * dt
        return HeadSample(roll: roll, pitch: pitch, yaw: yaw, userAccel: mul(sub(a, up), accelSign), rotationRate: w, gravity: g)
    }
}
