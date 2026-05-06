@echo off
chcp 65001 >nul
echo.
echo ╔═══════════════════════════════════════════════════╗
echo ║     蔬菜小票打印系统 v2.0 - 启动服务器            ║
echo ╚═══════════════════════════════════════════════════╝
echo.

:: 检查 Python 是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Python，请先安装 Python
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [信息] 正在启动服务器...
echo [信息] 访问地址: http://localhost:8080
echo [信息] 按 Ctrl+C 停止服务器
echo.

python -m http.server 8080

if errorlevel 1 (
    echo.
    echo [错误] 启动失败，请检查 8080 端口是否被占用
    pause
)
