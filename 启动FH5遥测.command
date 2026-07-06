#!/bin/bash
# ============================================
#  FH5 遥测仪表盘 - 一键开发调试启动脚本
#  双击此文件即可启动前端+后端服务并打开浏览器
# ============================================

# 切换到 forza-telemetry 目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "${SCRIPT_DIR}/forza-telemetry"

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

# ---- 退出清理 ----
SERVER_PID=""
CLIENT_PID=""

cleanup() {
    echo ""
    warn "正在停止服务..."
    if [ -n "$SERVER_PID" ]; then
        kill "$SERVER_PID" 2>/dev/null || true
    fi
    if [ -n "$CLIENT_PID" ]; then
        kill "$CLIENT_PID" 2>/dev/null || true
    fi
    # 强制清理端口
    lsof -ti :9188 2>/dev/null | xargs kill -9 2>/dev/null || true
    lsof -ti :9189 2>/dev/null | xargs kill -9 2>/dev/null || true
    lsof -ti :9996 2>/dev/null | xargs kill -9 2>/dev/null || true
    ok "服务已停止，再见！"
    exit 0
}
trap cleanup SIGINT SIGTERM

# ---- 端口检查 ----
check_port() { lsof -ti :"$1" >/dev/null 2>&1; }
kill_port()  { lsof -ti :"$1" 2>/dev/null | xargs kill -9 2>/dev/null || true; }

# ============ 开始 ============
echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   ${CYAN}🏎  FH5 遥测仪表盘 - 一键启动${NC}${BOLD}   ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""

# 1. 检查 Node.js
if ! command -v node &>/dev/null; then
    err "未安装 Node.js，请先访问 ${CYAN}https://nodejs.org/${NC} 安装"
    echo ""
    echo "按任意键退出..."
    read -rsn 1
    exit 1
fi

NODE_VER=$(node -v)
log "Node.js ${CYAN}${NODE_VER}${NC}"

# 2. 清理被占用的端口
if check_port 9188; then
    warn "端口 9188 (后端) 被占用，正在关闭旧进程..."
    kill_port 9188
    sleep 1
fi
if check_port 9189; then
    warn "端口 9189 (前端) 被占用，正在关闭旧进程..."
    kill_port 9189
    sleep 1
fi
if check_port 9996; then
    warn "UDP 端口 9996 被占用，正在释放..."
    kill_port 9996
    sleep 1
fi

# 3. 获取本机 IP（用于手机访问提示）
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

# 5. 启动后端服务
log "启动遥测后端服务（端口 ${CYAN}9188${NC}）..."
cd server
node src/index.js > ../server.log 2>&1 &
SERVER_PID=$!
cd ..

# 6. 启动前端 Vite 服务
log "启动前端开发服务（端口 ${CYAN}9189${NC}）..."
cd client
npm run dev > ../client.log 2>&1 &
CLIENT_PID=$!
cd ..

# 7. 等待两个端口就绪
log "等待服务就绪..."
MAX_WAIT=15
WAITED=0
while ! check_port 9188 || ! check_port 9189; do
    sleep 1
    WAITED=$((WAITED + 1))
    if [ $WAITED -ge $MAX_WAIT ]; then
        err "服务启动超时，请检查日志："
        echo -e "  后端日志: ${DIM}cat ${SCRIPT_DIR}/forza-telemetry/server.log${NC}"
        echo -e "  前端日志: ${DIM}cat ${SCRIPT_DIR}/forza-telemetry/client.log${NC}"
        echo ""
        echo "按任意键退出..."
        read -rsn 1
        exit 1
    fi
done

ok "前端与后端服务均启动成功！"
log "后端 PID: ${SERVER_PID} | 前端 PID: ${CLIENT_PID}"

# 8. 打开浏览器指向前端 Vite 开发端口 9189
sleep 0.5
open "http://127.0.0.1:9189"

# 9. 显示就绪信息
echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   ${GREEN}✔  遥测仪表盘已就绪！${NC}${BOLD}             ║${NC}"
echo -e "╚══════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}电脑访问${NC}  ${CYAN}http://127.0.0.1:9189${NC}"
echo -e "  ${BOLD}手机访问${NC}  ${CYAN}http://${IP}:9189${NC}"
echo ""
echo -e "  ${YELLOW}⚠️  请勿关闭此终端窗口！关闭它会导致服务停止。${NC}"
echo -e "  ${DIM}提示: 手机需与电脑在同一 WiFi 下${NC}"
echo -e "  ${DIM}游戏中请开启 Data Out → UDP 端口 9996${NC}"
echo -e "  ${DIM}后端 API 地址: http://127.0.0.1:9188${NC}"
echo ""
echo -e "  按 ${RED}Ctrl+C${NC} 停止服务"
echo ""

# 10. 保持运行，等待用户退出
while kill -0 "$SERVER_PID" 2>/dev/null && kill -0 "$CLIENT_PID" 2>/dev/null; do
    sleep 5
done

warn "某个服务进程已退出，脚本结束"
