#!/usr/bin/env bash

# Check if tailscale is installed
if ! command -v tailscale &>/dev/null; then
    echo '{"text": "󰌾", "class": "not-installed", "tooltip": "Tailscale not installed"}'
    exit 0
fi

# Check tailscale status (text output)
status=$(tailscale status 2>&1)

# Check if Tailscale is stopped
if echo "$status" | grep -q "Tailscale is stopped"; then
    echo '{"text": "󰄺", "class": "disconnected", "tooltip": "Tailscale: Stopped"}'
    exit 0
fi

# If we get here, Tailscale is running
# Extract useful info for tooltip
ip=$(tailscale ip -4 2>/dev/null || echo "N/A")

echo "{\"text\": \"󰄺\", \"class\": \"connected\", \"tooltip\": \"Tailscale: Running\\nIP: $ip\"}"
