#!/bin/bash
# Double-click this file to start the AirPod streamer.
cd "$(dirname "$0")"
xattr -dr com.apple.quarantine . 2>/dev/null
chmod +x ./HeadMotionStreamer

echo "=== AirPod Wipeout streamer ==="
DEFAULT_HOST="$(cat .last_host 2>/dev/null)"
read -p "Host laptop IP address${DEFAULT_HOST:+ [$DEFAULT_HOST]} (blank = this laptop is the host): " HOST
HOST="${HOST:-${DEFAULT_HOST:-127.0.0.1}}"
read -p "Player number (1 or 2) [2]: " PLAYER
PLAYER="${PLAYER:-2}"
echo "$HOST" > .last_host

echo
echo "Streaming to $HOST as player $PLAYER."
echo "Game:       http://$HOST:8080/?p=$PLAYER"
echo "Slack bot:  motion also goes to $HOST:9001 (in Slack: /slackoff pair $PLAYER)"
echo "(Hold Ctrl+C to stop. If macOS asks about local network or motion, click Allow.)"
echo
./HeadMotionStreamer --host "$HOST" --player "$PLAYER" --quiet
