#!/bin/bash
# Launch a Plane-focused Hermes session.
# Usage: plane-start
# The profile is "plane" (see ~/.hermes/profiles/plane/).

set -e
hermes profile use plane
exec hermes chat "$@"
