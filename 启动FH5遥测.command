#!/bin/bash
# ==========================================================
#   极限竞速：地平线 5 遥测仪表盘 - 一键启动器 (macOS 优化版)
# ==========================================================

# 锁定工作目录为脚本所在的绝对路径
cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"

# 自动补全可能未加载的环境变量路径
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# better-sqlite3 的预编译模块与 Node 22 长期支持版匹配。
# 不跟随系统中可能更新到的非长期支持版 Node，避免启动时找不到原生模块。
if command -v nvm &>/dev/null && [ "$(nvm version 22 2>/dev/null)" != "N/A" ]; then
    nvm use 22 >/dev/null
fi

# ANSI 终端色彩
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

get_time() { date "+%H:%M:%S"; }

# 智能获取本地活跃的局域网 IP
get_local_ip() {
    local ip=$(ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -n 1)
    if [ -n "$ip" ]; then
        echo "$ip"
    else
        echo "无法获取"
    fi
}

kill_port() {
    local port=$1
    local pid=$(lsof -ti:$port 2>/dev/null)
    if [ -n "$pid" ]; then
        echo -e "[$(get_time)] ${YELLOW}正在清理被占用的 $port 端口...${NC}"
        kill -9 $pid 2>/dev/null
        sleep 0.5
    fi
}

clear
echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║             🏎   极限竞速：地平线 5 遥测分析仪              ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# 1. 检查 Node.js 环境
if ! command -v node &>/dev/null; then
    echo -e "[$(get_time)] ${RED}未检测到 Node.js 环境，启动失败。${NC}"
    echo -e "请先前往 Node.js 官网下载并安装: ${CYAN}https://nodejs.org/${NC}"
    echo ""
    echo "按任意键退出..."
    read -rsn 1
    exit 1
fi

echo -e "[$(get_time)] 检测到 Node.js 版本: $(node -v)"

# 2. 检查依赖项并自动安装
if [ ! -d "forza-telemetry/server/node_modules" ]; then
    echo -e "[$(get_time)] ${YELLOW}未检测到后端服务依赖，正在为您安装，请稍候...${NC}"
    cd forza-telemetry/server && npm install --prefer-offline && cd "$PROJECT_DIR"
fi

if [ ! -d "forza-telemetry/client/node_modules" ]; then
    echo -e "[$(get_time)] ${YELLOW}未检测到前端页面依赖，正在为您安装，请稍候...${NC}"
    cd forza-telemetry/client && npm install --prefer-offline && cd "$PROJECT_DIR"
fi

# 3. 检查并增量构建前端静态资源
NEED_BUILD=0
if [ ! -d "forza-telemetry/client/dist" ]; then
    NEED_BUILD=1
else
    if [ -n "$(find forza-telemetry/client/src -newer forza-telemetry/client/dist -print -quit 2>/dev/null)" ]; then
        NEED_BUILD=1
    fi
fi

if [ "$NEED_BUILD" -eq 1 ]; then
    echo -e "[$(get_time)] ${YELLOW}检测到前端页面有源码更新，正在进行编译打包...${NC}"
    cd forza-telemetry/client && npm run build && cd "$PROJECT_DIR"
fi

# 4. 清理残留进程，释放 9187, 9188 与 UDP 9996 端口
kill_port 9187
kill_port 9188
udp_pid=$(lsof -t -iUDP:9996 2>/dev/null)
if [ -n "$udp_pid" ]; then
    echo -e "[$(get_time)] ${YELLOW}正在清理占用的 UDP 9996 遥测端口...${NC}"
    kill -9 $udp_pid 2>/dev/null
    sleep 0.5
fi

# 5. 后台延时打开浏览器
LOCAL_IP=$(get_local_ip)
(
    sleep 1.8
    open "http://127.0.0.1:9188" 2>/dev/null
) &

# 6. 打印启动信息提示
echo ""
echo -e "${GREEN}==========================================================${NC}"
echo -e "${GREEN}                 ✔ 遥测分析仪服务已成功就绪！${NC}"
echo -e "${GREEN}==========================================================${NC}"
echo ""
echo -e "   💻  ${BOLD}电脑端访问地址${NC}： ${CYAN}http://127.0.0.1:9188${NC}"
if [[ "$LOCAL_IP" != *"无法获取"* ]]; then
    echo -e "   📱  ${BOLD}手机/平板访问${NC}：  ${CYAN}http://${LOCAL_IP}:9188${NC}  ${YELLOW}(需连接同一无线局域网)${NC}"
fi
echo ""
echo -e "   ⚠️  ${YELLOW}提示: 请保持此窗口打开。关闭此窗口会导致仪表盘服务中断。${NC}"
echo -e "   💡  ${YELLOW}退出方式: 在此窗口中按 Ctrl+C 键即可彻底关闭服务。${NC}"
echo -e "${GREEN}==========================================================${NC}"
echo ""
echo -e "[$(get_time)] 开始接收遥测数据并输出服务日志..."

# 7. 前台启动服务以打印实时日志
cd "$PROJECT_DIR/forza-telemetry/server"

# 自动保持 better-sqlite3 原生模块与当前 Node.js 版本 ABI 契合
npm rebuild better-sqlite3 --silent 2>/dev/null

node src/index.js
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ] && [ $EXIT_CODE -ne 130 ]; then
    echo ""
    echo -e "${YELLOW}[$(get_time)] 检测到 Node.js 模块 ABI 不匹配，正在自动为您编译修复原生依赖...${NC}"
    npm rebuild better-sqlite3
    echo -e "${GREEN}[$(get_time)] 依赖重构完成，正在重新拉起遥测分析服务...${NC}"
    node src/index.js
fi
