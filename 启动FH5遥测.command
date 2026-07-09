#!/bin/bash
# FH5 遥测仪表盘 - 一键启动脚本

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "${SCRIPT_DIR}/forza-telemetry"

export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.nvm/versions/node/*/bin:$PATH"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

get_time() { date "+%H:%M:%S"; }
get_local_ip() { ipconfig getifaddr en0 2>/dev/null || echo "未知"; }

kill_port() {
    local pid=$(lsof -ti:$1 2>/dev/null)
    if [ -n "$pid" ]; then
        echo -e "[$(get_time)] ${YELLOW}⚠ 端口 $1 被占用，正在关闭旧进程...${NC}"
        kill -9 $pid 2>/dev/null; sleep 1
    fi
}

clear
echo ""
echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   🏎  FH5 遥测仪表盘 - 一键启动   ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

if ! command -v node &>/dev/null; then
    echo -e "[$(get_time)] ${RED}✘ 未检测到 Node.js${NC}"
    echo "按任意键退出..."; read -rsn 1; exit 1
fi

echo -e "[$(get_time)] Node.js $(node -v)"

# 检查依赖
[ ! -d "server/node_modules" ] && echo -e "[$(get_time)] ${YELLOW}安装后端依赖...${NC}" && cd server && npm install --prefer-offline 2>&1 | tail -1 && cd ..
[ ! -d "client/node_modules" ] && echo -e "[$(get_time)] ${YELLOW}安装前端依赖...${NC}" && cd client && npm install --prefer-offline 2>&1 | tail -1 && cd ..

# 构建前端
if [ ! -d "client/dist" ] || [ "client/src" -nt "client/dist" ]; then
    echo -e "[$(get_time)] 构建前端..."
    cd client && npm run build 2>&1 | tail -3 && cd ..
fi

kill_port 9188

echo -e "[$(get_time)] 启动遥测服务（端口 9188）..."
cd server && npm start > /tmp/fh5-server.log 2>&1 & SERVER_PID=$!; cd ..
echo -e "[$(get_time)] 等待服务就绪..."
sleep 3

if kill -0 $SERVER_PID 2>/dev/null; then
    echo -e "[$(get_time)] ${GREEN}✔ 服务启动成功！${NC}"
    echo -e "[$(get_time)] PID: ${SERVER_PID}"
else
    echo -e "[$(get_time)] ${RED}✘ 服务启动失败${NC}"
    echo "按任意键退出..."; read -rsn 1; exit 1
fi

LOCAL_IP=$(get_local_ip)
echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✔  遥测仪表盘已就绪！             ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""
echo -e "  电脑访问  ${CYAN}http://127.0.0.1:9188${NC}"
echo -e "  手机访问  ${CYAN}http://${LOCAL_IP}:9188${NC}"
echo ""
echo -e "  ${YELLOW}⚠️  请勿关闭此终端窗口！关闭它会导致服务停止。${NC}"
echo ""

sleep 2 && open "http://127.0.0.1:9188" &
wait
