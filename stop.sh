#!/bin/bash
# Stop the most recent plane-profile session.
pkill -f "hermes.*chat.*--profile plane" 2>/dev/null || true
pkill -f "hermes profile use plane" 2>/dev/null || true
# Also try the direct kill
pkill -f "plane" 2>/dev/null || echo "No plane sessions running"
echo "Done."
