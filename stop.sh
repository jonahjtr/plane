#!/bin/bash
set -e

echo "Stopping Plane containers..."
cd "$(dirname "$0")"
docker compose down

echo "Stopping colima VM..."
colima stop

echo "✓ Everything is off."
