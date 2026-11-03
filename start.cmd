@echo off
chcp 65001 >nul
rem OnniMart одним кліком: Docker, база, API, worker, сайт і публічне посилання (scripts/start.ts)
cd /d "%~dp0"
bun scripts\start.ts
pause
