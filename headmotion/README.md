# AirPod Wipeout (tilt joystick)

1. Terminal 1: `swift run HeadMotionStreamer` (AirPod connected; Automatic Ear Detection off to hold it in your hand)
2. Terminal 2: `node bridge/server.js`, then open http://localhost:8080
3. Press Enter, follow the 5 calibration steps (hold still, lean left, right, forward, back), press Enter to race.

Controls: lean left/right = steer, lean forward = move forward, lean back = move backward (level = stopped).
Keyboard fallback: A/D or arrows to steer, W/S or up/down to move.
Tuning keys: F flip left/right, G flip forward/back, `,` `.` sensitivity, R recalibrate.
