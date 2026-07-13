#!/bin/bash
# =========================================================================
#   极限竞速：地平线 5 遥测分析仪 - 一键启动与数据清理工具
# =========================================================================

# 锁定工作目录为脚本所在的绝对路径
cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"

# 自动加载可能未加载的环境变量路径
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# ANSI 终端色彩
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

get_time() { date "+%H:%M:%S"; }

# 释放端口的辅助函数
kill_port() {
    local port=$1
    local pid=$(lsof -ti :$port 2>/dev/null)
    if [ -n "$pid" ]; then
        echo -e "[$(get_time)] ${YELLOW}正在清理被占用的 $port 端口...${NC}"
        kill -9 $pid 2>/dev/null
        sleep 0.5
    fi
}

clear
echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         🏎   地平线 5 遥测仪表盘一键启动与自检工具         ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# 1. 检查 Node.js 环境
if ! command -v node &>/dev/null; then
    echo -e "[$(get_time)] ${RED}❌ 未检测到 Node.js 环境，启动失败。${NC}"
    echo -e "请先前往 Node.js 官网下载并安装: ${CYAN}https://nodejs.org/${NC}"
    echo ""
    read -p "按回车退出..."
    exit 1
fi
echo -e "[$(get_time)] ${GREEN}✔ Node.js 已就绪: ${NC}$(node -v)"

# 1.1 检查 Node.js 运行权限与免权限绕过方案
USE_BYPASS=false
if ! node -e "process.cwd()" &>/dev/null; then
    # 尝试在主目录下读取项目文件进行诊断
    if (cd "$HOME" && node -e "require('fs').readFileSync('$PROJECT_DIR/forza-telemetry/server/package.json')" &>/dev/null); then
        # 绕过检测成功，我们可以将工作目录保持在 $HOME，以避开 macOS 对 Desktop 的 uv_cwd 拦截
        USE_BYPASS=true
    else
        echo ""
        echo -e "[$(get_time)] ${RED}❌ Node.js 运行权限不足 (EPERM uv_cwd)！${NC}"
        echo -e "这通常是因为项目文件夹位于 ${CYAN}桌面 (Desktop)${NC}、${CYAN}下载 (Downloads)${NC} 或 ${CYAN}文档 (Documents)${NC} 等受保护的系统目录，而当前终端未获得该文件夹的访问权限。"
        echo -e "【解决方案】："
        echo -e "  1. ${BOLD}推荐（最简单方便）${NC}：将整个 ${YELLOW}fh5${NC} 文件夹移动到用户个人目录下（例如：${CYAN}/Users/$(whoami)/fh5${NC}），然后重新运行脚本。"
        echo -e "  2. ${BOLD}或者${NC}：在系统的【系统设置 -> 隐私与安全性 -> 文件和文件夹】中，确保【终端 (Terminal)】或【iTerm】已勾选【桌面】权限。"
        echo -e ""
        read -p "按回车退出..."
        exit 1
    fi
fi

# 2. 检查目录完整性
if [ ! -d "forza-telemetry" ]; then
    echo -e "[$(get_time)] ${RED}❌ 未检测到 forza-telemetry 目录，请确保此脚本放置在项目根目录下。${NC}"
    read -p "按回车退出..."
    exit 1
fi

# 3. 自动安装依赖项与编译前端（按需）
if [ ! -d "forza-telemetry/server/node_modules" ]; then
    echo -e "[$(get_time)] ${YELLOW}未检测到后端依赖，正在自动为您安装...${NC}"
    if [ "$USE_BYPASS" = "true" ]; then
        cd "$HOME" && npm install --prefix "$PROJECT_DIR/forza-telemetry/server" --prefer-offline
    else
        cd "$PROJECT_DIR/forza-telemetry/server" && npm install --prefer-offline
    fi
    cd "$PROJECT_DIR"
fi

if [ ! -d "forza-telemetry/client/node_modules" ]; then
    echo -e "[$(get_time)] ${YELLOW}未检测到前端依赖，正在自动为您安装...${NC}"
    if [ "$USE_BYPASS" = "true" ]; then
        cd "$HOME" && npm install --prefix "$PROJECT_DIR/forza-telemetry/client" --prefer-offline
    else
        cd "$PROJECT_DIR/forza-telemetry/client" && npm install --prefer-offline
    fi
    cd "$PROJECT_DIR"
fi

if [ ! -d "forza-telemetry/client/dist" ]; then
    echo -e "[$(get_time)] ${YELLOW}未检测到前端编译产物，正在自动编译前端...${NC}"
    if [ "$USE_BYPASS" = "true" ]; then
        cd "$HOME" && npm run build --prefix "$PROJECT_DIR/forza-telemetry/client"
    else
        cd "$PROJECT_DIR/forza-telemetry/client" && npm run build
    fi
    cd "$PROJECT_DIR"
fi

# 4. 执行数据同步与清洗
echo -e "[$(get_time)] 正在同步赛道元数据与历史会话记录..."
if [ "$USE_BYPASS" = "true" ]; then
    cd "$HOME"
    node "$PROJECT_DIR/forza-telemetry/scripts/sync_tracks.js" 2>/dev/null
    node "$PROJECT_DIR/forza-telemetry/scripts/clean_sessions.mjs" 2>/dev/null
    node "$PROJECT_DIR/forza-telemetry/scripts/clean_history.js" 2>/dev/null
else
    cd "$PROJECT_DIR/forza-telemetry"
    node scripts/sync_tracks.js 2>/dev/null
    node scripts/clean_sessions.mjs 2>/dev/null
    node scripts/clean_history.js 2>/dev/null
fi
cd "$PROJECT_DIR"

# 5. 清理被占用的端口
kill_port 9188
kill_port 9996

# 6. 后台打开浏览器
(
    sleep 1.5
    open "http://127.0.0.1:9188" 2>/dev/null
) &

# 7. 打印就绪提示并前台启动 Node 服务
echo ""
echo -e "${GREEN}==========================================================${NC}"
echo -e "${GREEN}             ✔ 遥测仪表盘与数据清洗服务启动成功！          ${NC}"
echo -e "${GREEN}==========================================================${NC}"
echo ""
echo -e "   💻  ${BOLD}电脑端访问地址${NC}： ${CYAN}http://127.0.0.1:9188${NC}"
echo ""
echo -e "   ⚠️  ${YELLOW}请保持此终端窗口打开。关闭此窗口会导致仪表盘服务中断。${NC}"
echo -e "   💡  ${YELLOW}退出方式: 在此窗口中按 Ctrl+C 键即可彻底关闭服务。${NC}"
echo -e "${GREEN}==========================================================${NC}"
echo ""

if [ "$USE_BYPASS" = "true" ]; then
    cd "$HOME"
    node "$PROJECT_DIR/forza-telemetry/server/src/index.js"
else
    cd "$PROJECT_DIR/forza-telemetry/server"
    node src/index.js
fi
