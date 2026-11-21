# Slackoff AirPod streamer

Reads AirPod motion (CMHeadphoneMotionManager) and sends it over UDP to the web app's server.

    swift run HeadMotionStreamer                                  # host laptop
    swift run HeadMotionStreamer --host <host-ip> --player 2      # friend's laptop

Flags: `--port`, `--host`, `--player`, `--csv file`, `--quiet`, `--stem`.
No Xcode? Use `dist/AirPodStreamer.zip` (Apple Silicon): unzip and double-click `Start.command`.
