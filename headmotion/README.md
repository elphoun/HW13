# AirPod Wipeout (tilt joystick)

1. Terminal 1: `swift run HeadMotionStreamer` (AirPod connected; Automatic Ear Detection off to hold it in your hand)
2. Terminal 2: `node bridge/server.js`, then open http://localhost:8080
3. Press Enter, follow the 5 calibration steps (hold still, lean left, right, forward, back), press Enter to race.

Controls: lean left/right = steer, lean forward = move forward, lean back = move backward (level = stopped).
Keyboard fallback: A/D or arrows to steer, W/S or up/down to move.
Tuning keys: F flip left/right, G flip forward/back, `,` `.` sensitivity, C recenter neutral, R recalibrate.

Dead zone: near neutral the stick reads exactly 0 and the craft stops. The radius is the larger of the
dead-zone setting (default 0.20 of your calibrated lean) and 3x the hand jitter measured during the "hold still" step.

Debug menu: press `` ` `` to toggle. It has a dead-zone and a sensitivity slider, a recenter button, and a **Joystick view**
that plots the AirPod's live tilt in calibrated space: the dead-zone circle (magenta), the jitter ring (yellow, dotted),
the four calibrated L/R/F/B poses, the full-lean box, a short trail, and raw/output/tilt-angle readouts.
