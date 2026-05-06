#!/bin/bash

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║     蔬菜小票打印系统 v2.0 - 启动服务器            ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# 检查 Python 是否安装
if ! command -v python3 &> /dev/null; then
    echo "[错误] 未检测到 Python3，请先安装 Python"
    echo "Mac: brew install python3"
    echo "Linux: sudo apt-get install python3"
    exit 1
fi

echo "[信息] 正在启动服务器..."
echo "[信息] 访问地址: http://localhost:8080"
echo "[信息] 按 Ctrl+C 停止服务器"
echo ""

cd "$(dirname "$0")"
python3 -m http.server 8080

if [ $? -ne 0 ]; then
    echo ""
    echo "[错误] 启动失败，请检查 8080 端口是否被占用"
    read -p "按回车键退出..."
fi
