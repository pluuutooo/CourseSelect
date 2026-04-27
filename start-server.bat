@echo off
echo Starting ECNU Course Selection Prototype...
echo.
echo Open browser: http://localhost:8080/prototype/index.html
echo Press Ctrl+C to stop the server
echo.
cd /d "%~dp0"
python -m http.server 8080
