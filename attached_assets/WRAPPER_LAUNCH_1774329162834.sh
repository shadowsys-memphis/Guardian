#!/bin/bash
# ============================================================================
# br(AI)n App Unified Wrapper
# Starts Frontend, State Bridge, and OpenClaw Brain in one command.
# ============================================================================

# Colors for terminal output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================"
echo -e "   STARTING br(AI)n APP WRAPPER"
echo -e "======================================${NC}"

# 1. Start the State Server (Port 3334)
echo -e "${YELLOW}[1/4] Starting State Bridge (Backend)...${NC}"
node state-server.js > state_server.log 2>&1 &
STATE_PID=$!

# 2. Start the Gemini API Server (Port 3333)
echo -e "${YELLOW}[2/4] Starting Gemini API Server (Voice Brain)...${NC}"
(cd phone_system/gemini-phone/gemini-api-server && node server.js > server.log 2>&1 &)
API_PID=$!

# 3. Start the OpenClaw Gateway (Port 18789)
echo -e "${YELLOW}[3/4] Starting OpenClaw Brain...${NC}"
# Use the local Gemini API Key already provided
export GEMINI_API_KEY="AIzaSyA7AXbtdyys-zari92h75OC8-UZ4RtbqDI"
(cd phone_system/jessica-openclaw && openclaw gateway --force > openclaw.log 2>&1 &)
CLAW_PID=$!

# 4. Start the Vite Frontend (Port 5173/3000)
echo -e "${YELLOW}[4/4] Launching Frontend...${NC}"
npm run dev:vite > vite.log 2>&1 &
VITE_PID=$!

# Function to kill all processes on exit
cleanup() {
    echo -e "\n${BLUE}Shutting down all services...${NC}"
    kill $STATE_PID $API_PID $CLAW_PID $VITE_PID
    exit
}
trap cleanup SIGINT SIGTERM

echo -e "${GREEN}======================================"
echo -e "   ALL SYSTEMS ONLINE"
echo -e "======================================${NC}"
echo -e "Frontend:     http://localhost:5173"
echo -e "Brain (OpenClaw): http://localhost:18789"
echo -e "Gemini API:   http://localhost:3333"
echo -e "State Bridge: http://localhost:3334"
echo ""
echo -e "Press ${YELLOW}Ctrl+C${NC} to stop everything."

# Keep script running
wait
