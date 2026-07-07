#!/bin/bash
# ============================================
#  FH5 遥测仪表盘 - 服务启动脚本
#  由"启动FH5遥测.command"调用，运行在不受沙箱限制的 Terminal 窗口中
# ============================================

# 统一端口配置
HTTP_PORT=${HTTP_PORT:-9188}
UDP_PORT=${UDP_PORT:-9996}

# ---- 颜色定义 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ---- 工具函数 ----
log()  { echo -e "${DIM}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${DIM}[$(date +%H:%M:%S)]${NC} ${GREEN}✔${NC} $*"; }
warn() { echo -e "${DIM}[$(date +%H:%M:%S)]${NC} ${YELLOW}⚠${NC} $*"; }
err()  { echo -e "${DIM}[$(date +%H:%M:%S)]${NC} ${RED}✘${NC} $*"; }

# ---- 端口检查 ----
check_port() { lsof -ti :"$1" >/dev/null 2>&1; }
kill_port()  { lsof -ti :"$1" 2>/dev/null | xargs kill -9 2>/dev/null || true; }

# ============ 开始 ============
echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   ${CYAN}FH5 遥测仪表盘 - 一键启动${NC}${BOLD}     ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""

# 1. 检查 Node.js
if ! command -v node &>/dev/null; then
    err "未安装 Node.js，请先访问 ${CYAN}https://nodejs.org/${NC} 安装"
    echo "按任意键退出..."
    read -rsn 1
    exit 1
fi
log "Node.js ${CYAN}$(node -v)${NC}"

# 2. 清理被占用的端口
if check_port $HTTP_PORT; then
    warn "端口 $HTTP_PORT 被占用，正在关闭旧进程..."
    kill_port $HTTP_PORT
    sleep 1
fi
if check_port $UDP_PORT; then
    warn "UDP 端口 $UDP_PORT 被占用，正在释放..."
    kill_port $UDP_PORT
    sleep 1
fi

# 3. 获取本机 IP
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")

# 4. 安装依赖（按需）
if [ ! -d "server/node_modules" ]; then
    log "安装服务端依赖..."
    cd server && npm install --prefer-offline && cd ..
    ok "服务端依赖安装完成"
fi

if [ ! -d "client/node_modules" ]; then
    log "安装前端依赖..."
    cd client && npm install --prefer-offline && cd ..
    ok "前端依赖安装完成"
fi

# 5. 启动遥测主服务
log "启动遥测服务（端口 ${CYAN}$HTTP_PORT${NC}）..."
node server/src/index.js > server.log 2>&1 &
SERVER_PID=$!

# 6. 等待服务端口就绪
log "等待服务就绪..."
MAX_WAIT=15
WAITED=0
while ! check_port $HTTP_PORT; do
    sleep 1
    WAITED=$((WAITED + 1))
    if [ $WAITED -ge $MAX_WAIT ]; then
        err "服务启动超时，请检查日志："
        echo -e "  ${DIM}cat server.log${NC}"
        echo "按任意键退出..."
        read -rsn 1
        exit 1
    fi
done

ok "遥测服务启动成功！"
log "服务 PID: $SERVER_PID"

# 7. 打开浏览器
sleep 0.5
open "http://127.0.0.1:$HTTP_PORT"

# 8. 显示就绪信息
echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   ${GREEN}✔  遥测仪表盘已就绪！${NC}${BOLD}             ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}网页端服务${NC}  ${CYAN}http://127.0.0.1:$HTTP_PORT${NC}"
echo -e "  ${BOLD}局域网访问${NC}  ${CYAN}http://${IP}:$HTTP_PORT${NC}"
echo ""
echo -e "  ${YELLOW}请勿关闭此终端窗口！关闭它会导致服务停止。${NC}"
echo -e "  ${DIM}提示: 手机/平板需与电脑在同一 WiFi 下${NC}"
echo -e "  ${DIM}游戏中请开启 Data Out -> UDP 端口 $UDP_PORT${NC}"
echo ""
echo -e "  按 ${RED}Ctrl+C${NC} 停止服务"
echo ""

# 9. 保持运行，等待用户退出
trap 'kill $SERVER_PID 2>/dev/null; kill_port $HTTP_PORT; kill_port $UDP_PORT; echo ""; ok "服务已停止，再见！"; exit 0' SIGINT SIGTERM
while kill -0 "$SERVER_PID" 2>/dev/null; do
    sleep 5
done

warn "服务进程已退出，脚本结束"
