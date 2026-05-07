@echo off
chcp 65001 >nul
echo.
echo   正在打包生鲜小票系统...
echo.

set "SRC=C:\Users\Admin\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\69fc6dece1d5152c07601427"
set "ZIP=%SRC%\生鲜小票系统.zip"

if exist "%ZIP%" del "%ZIP%"

powershell -NoProfile -Command "Compress-Archive -Path '%SRC%\index.html','%SRC%\bluetooth-printer.js','%SRC%\manifest.json','%SRC%\service-worker.js','%SRC%\README.md','%SRC%\INSTALL.md','%SRC%\SPEC.md','%SRC%\更新日志.md','%SRC%\快速开始.txt' -DestinationPath '%ZIP%' -Force"

if exist "%ZIP%" (
    echo.
    echo   ========================================
    echo     打包完成！
    echo   ========================================
    echo.
    echo   文件位置：
    echo   %ZIP%
    echo.
) else (
    echo.
    echo   打包失败，请检查文件是否存在
    echo.
)

pause
