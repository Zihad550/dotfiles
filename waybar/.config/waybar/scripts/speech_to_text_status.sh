#!/usr/bin/env bash

if pgrep -f "/usr/bin/nerd-dictation" >/dev/null; then
    echo '{"text": "🎤", "class": "running"}'
else
    echo '{"text": "🎙️", "class": "stopped"}'
fi
