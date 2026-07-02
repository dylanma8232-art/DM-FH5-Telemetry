#!/bin/bash
# FH5 遥测仪表盘 - 一键启动脚本
# 双击此文件即可启动服务并打开浏览器

cd "$(dirname "$0")/forza-telemetry"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo "======================================"
echo "   FH5 遥测仪表盘 - 一键启动"
echo "======================================"
echo ""

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}错误: 未安装 Node.js，请先安装 https://nodejs.org/${NC}"
    echo "按任意键退出..."
    read -n 1
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${CYAN}Node.js 版本: ${NODE_VERSION}${NC}"

# 检查端口占用
check_port() {
    lsof -i :$1 -t 2>/dev/null
}

if check_port 9188; then
    echo -e "${YELLOW}端口 9188 被占用，正在关闭旧进程...${NC}"
    lsof -i :9188 -t 2>/dev/null | xargs kill -9 2>/dev/null
    sleep 1
fi

if check_port 9996; then
    echo -e "${YELLOW}UDP端口 9996 被占用，正在释放...${NC}"
    lsof -i :9996 -t 2>/dev/null | xargs kill -9 2>/dev/null
    sleep 1
fi

# 获取本机IP
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")

# 检查依赖
if [ ! -d "server/node_modules" ]; then
    echo -e "${YELLOW}安装服务端依赖...${NC}"
    cd server && npm install && cd ..
fi

if [ ! -d "client/node_modules" ]; then
    echo -e "${YELLOW}安装前端依赖...${NC}"
    cd client && npm install && cd ..
fi

# 构建前端（如果dist不存在或源码已更新）
if [ ! -d "client/dist" ] || [ -n "$(find client/src -newer client/dist/index.html 2>/dev/null)" ]; then
    echo -e "${YELLOW}检测到前端源码已更新，正在重新构建前端...${NC}"
    cd client && npm run build && cd ..
    echo -e "${GREEN}前端构建完成${NC}"
fi

# 启动后端服务
echo ""
echo -e "${GREEN}启动遥测服务...${NC}"
cd server
node src/index.js > ../server.log 2>&1 &
SERVER_PID=$!
cd ..

# 等待服务启动
sleep 2

# 检查服务是否成功启动
if check_port 9188; then
    echo -e "${GREEN}服务启动成功！${NC}"
else
    echo -e "${RED}服务启动失败，请查看 server.log${NC}"
    echo "按任意键退出..."
    read -n 1
    exit 1
fi

echo ""
echo "======================================"
echo -e "  ${GREEN}遥测仪表盘已就绪！${NC}"
echo "======================================"
echo ""
echo -e "  电脑访问:  ${CYAN}http://localhost:9188${NC}"
echo -e "  手机访问:  ${CYAN}http://${IP}:9188${NC}"
echo ""
echo -e "  ${YELLOW}提示: 手机需与电脑在同一WiFi下${NC}"
echo -e "  ${YELLOW}游戏中请开启 Data Out (UDP 9996)${NC}"
echo ""
echo -e "  按 ${RED}Ctrl+C${NC} 停止服务"
echo ""

# 打开浏览器
sleep 1
open "http://localhost:9188"

# 保持脚本运行（Ctrl+C退出）
echo -e "${CYAN}服务运行中... PID: ${SERVER_PID}${NC}"
echo -e "${CYAN}日志文件: server.log${NC}"
echo ""

# 捕获退出信号，清理进程
cleanup() {
    echo ""
    echo -e "${YELLOW}正在停止服务...${NC}"
    lsof -i :9188 -t 2>/dev/null | xargs kill -9 2>/dev/null
    lsof -i :9996 -t 2>/dev/null | xargs kill -9 2>/dev/null
    echo -e "${GREEN}服务已停止${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# 持续运行，显示简单状态
while true; do
    sleep 30
done
