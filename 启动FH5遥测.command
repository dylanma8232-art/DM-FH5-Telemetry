#!/bin/bash
# ============================================
#  FH5 遥测仪表盘 - 一键启动脚本 (macOS)
#  双击此文件即可启动，端口 9188
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "${SCRIPT_DIR}/forza-telemetry"

export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.nvm/versions/node/*/bin:$PATH"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}   FH5 遥测仪表盘 - 一键启动${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""

if ! command -v node &>/dev/null; then
    echo -e "${RED}[错误] 未检测到 Node.js${NC}"
    echo "请前往 https://nodejs.org/ 下载安装"
    echo ""
    echo "按任意键退出..."
    read -rsn 1
    exit 1
fi

echo -e "${GREEN}[OK]${NC} Node.js $(node -v)"

[ ! -d "server/node_modules" ] && echo -e "${YELLOW}[安装] 后端依赖...${NC}" && cd server && npm install --prefer-offline && cd ..

echo -e "${GREEN}[启动] http://localhost:9188${NC}"
sleep 2 && open "http://localhost:9188" &
cd server && npm start
