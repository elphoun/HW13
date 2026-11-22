# Slackoff AirPod streamer

Reads AirPod motion (CMHeadphoneMotionManager) and sends every packet over UDP to both the web game's bridge
(port 9000) and the Slack bot (port 9001), so the game and the bot can run at the same time.

    swift run HeadMotionStreamer                                  # host laptop
    swift run HeadMotionStreamer --host <host-ip> --player 2      # friend's laptop

Flags: `--host`, `--port` (game, 9000), `--bot-port` (Slack bot, 9001; `0` turns it off), `--bot-host` (defaults to `--host`),
`--player`, `--csv file`, `--quiet`, `--stem`.
No Xcode? Use `dist/AirPodStreamer.zip` (Apple Silicon): unzip and double-click `Start.command`.
