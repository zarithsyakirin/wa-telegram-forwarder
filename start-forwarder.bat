@echo off
cd /d "%~dp0"
:loop
node forward.js
timeout /t 15
goto loop