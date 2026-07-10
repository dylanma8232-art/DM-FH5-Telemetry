#!/bin/bash
# FH5 遥测仪表盘 - 一键极速启动脚本 (抗 EPERM 稳健版)

# 确保脚本在其所在目录下运行，并定位到项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ "$SCRIPT_DIR" == */forza-telemetry ]]; then
    PROJECT_DIR="$SCRIPT_DIR"
else
    PROJECT_DIR="${SCRIPT_DIR}/forza-telemetry"
fi
cd "$PROJECT_DIR"

export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.nvm/versions/node/*/bin:$PATH"

# ANSI 终端色彩
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

get_time() { date "+%H:%M:%S"; }

# 智能获取本地活跃的局域网 IP (多网卡自动遍历，排除环回和虚拟 IP)
get_local_ip() {
    local ip=$(ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -n 1)
    if [ -n "$ip" ]; then
        echo "$ip"
    else
        echo "未知(请连接Wi-Fi)"
    fi
}

kill_port() {
    local pid=$(lsof -ti:$1 2>/dev/null)
    if [ -n "$pid" ]; then
        echo -e "[$(get_time)] ${YELLOW}⚠ 正在清理被占用的 $1 端口...${NC}"
        kill -9 $pid 2>/dev/null; sleep 1
    fi
}

clear
echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║             🏎   FH5 遥测仪表盘 - 一键启动器             ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

if ! command -v node &>/dev/null; then
    echo -e "[$(get_time)] ${RED}✘ 启动失败: 未检测到 Node.js，请先安装 Node 环境。${NC}"
    echo "按任意键退出..."; read -rsn 1; exit 1
fi

echo -e "[$(get_time)] Node.js $(node -v)"

# 检查依赖项
if [ ! -d "server/node_modules" ]; then
    echo -e "[$(get_time)] ${YELLOW}正在安装后端依赖，请稍等...${NC}"
    cd server && npm install --prefer-offline 2>&1 | tail -1 && cd ..
fi
if [ ! -d "client/node_modules" ]; then
    echo -e "[$(get_time)] ${YELLOW}正在安装前端依赖，请稍等...${NC}"
    cd client && npm install --prefer-offline 2>&1 | tail -1 && cd ..
fi

# 前端构建检测
if [ ! -d "client/dist" ] || [ "client/src" -nt "client/dist" ]; then
    echo -e "[$(get_time)] ${YELLOW}正在预编译前端 UI 静态资源...${NC}"
    cd client && npm run build 2>&1 | tail -3 && cd ..
fi

kill_port 9188

# 抗 EPERM 安全启动法：将运行 CWD 切换到公开只读 /tmp 文件夹，避免 macOS Desktop 沙箱限制
echo -e "[$(get_time)] 启动后台遥测服务 (监听 9188)..."
cd /tmp && node "${PROJECT_DIR}/server/src/index.js" > /tmp/fh5-server.log 2>&1 & SERVER_PID=$!; cd "$PROJECT_DIR"

echo -e "[$(get_time)] 等待网络就绪..."
sleep 2.5

# 确认服务存活状态
if kill -0 $SERVER_PID 2>/dev/null; then
    LOCAL_IP=$(get_local_ip)
    echo ""
    echo -e "${GREEN}  ╔══════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}  ║            ✔  FH5 遥测仪表盘已成功就绪！             ║${NC}"
    echo -e "${GREEN}  ╚══════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "   ${BOLD}💻  电脑端访问地址${NC}： ${CYAN}http://127.0.0.1:9188${NC}"
    echo -e "   ${BOLD}📱  手机/平板访问${NC}：  ${CYAN}http://${LOCAL_IP}:9188${NC}  ${YELLOW}(需处于同一 Wi-Fi)${NC}"
    echo ""
    echo -e "  ========================================================"
    echo -e "  [$(get_time)] ${GREEN}正在为您自动打开浏览器展示仪表盘...${NC}"
    
    sleep 1.2
    open "http://127.0.0.1:9188" &
else
    # 检查是否为 EPERM 权限限制错误
    if grep -q "EPERM" /tmp/fh5-server.log; then
        clear
        echo -e "${RED}╔══════════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║            ❌ 启动失败: macOS 桌面文件夹权限被拒绝        ║${NC}"
        echo -e "${RED}╚══════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e " 由于 macOS 的安全隐私保护，终端 (Terminal) 需要获得访问桌面的授权。"
        echo -e " 请按照以下极简的 4 步一键修复该问题："
        echo ""
        echo -e "   1️⃣  点击 Mac 屏幕左上角苹果图标  -> 打开 ${BOLD}【系统设置】${NC}"
        echo -e "   2️⃣  在左侧栏选择 ${BOLD}【隐私与安全性】${NC} -> 滚动点击 ${BOLD}【文件和文件夹】${NC}"
        echo -e "   3️⃣  在列表中找到 ${BOLD}【终端】(Terminal.app)${NC}"
        echo -e "   4️⃣  将它下方 ${BOLD}【桌面文件夹】${NC} 的开关开启 (亮起为绿色)"
        echo ""
        echo -e " --------------------------------------------------------"
        echo -e " ${YELLOW}💡 我已自动在您的屏幕中央弹出了授权指引框，请按指引操作。${NC}"
        echo ""
        
        # 屏幕中心弹出 critical 强提醒警告框
        osascript -e 'display alert "FH5 遥测服务启动失败" message "由于 macOS 的隐私保护限制，终端需要获得访问【桌面文件夹】的权限才能读取赛道和遥测数据。\n\n请前往【系统设置】->【隐私与安全性】->【文件和文件夹】下，开启终端的桌面访问权限。" as critical' &
    else
        echo -e "[$(get_time)] ${RED}✘ 服务启动失败！${NC}"
        echo -e "错误日志摘要 (尾部10行):"
        tail -n 10 /tmp/fh5-server.log
        echo ""
    fi
    echo "按任意键退出..."; read -rsn 1; exit 1
fi

echo -e "  ${YELLOW}⚠️  提示: 请保持此窗口开启。关闭此窗口会导致仪表盘服务中断。${NC}"
echo ""

# 阻塞主线程以保持终端生存，除非用户 Ctrl+C 退出
wait
