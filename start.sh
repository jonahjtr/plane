#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}Starting colima VM (4 CPU / 8GB RAM / 40GB disk)...${NC}"
if colima status 2>/dev/null | grep -q "Running"; then
  echo -e "${GREEN}✓ Colima already running${NC}"
else
  colima start --cpu 4 --memory 8 --disk 40
  echo -e "${GREEN}✓ Colima started${NC}"
fi

echo -e "${YELLOW}Starting Plane containers...${NC}"
cd "$(dirname "$0")"
docker compose up -d

echo ""
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
for i in {1..30}; do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:8282/ 2>/dev/null | grep -q "200"; then
    echo -e "${GREEN}✓ Plane is live at http://localhost:8282${NC}"
    exit 0
  fi
  sleep 2
done

echo -e "${RED}Plane didn't respond in 60s — check 'docker ps' and 'docker logs proxy'${NC}"
exit 1
