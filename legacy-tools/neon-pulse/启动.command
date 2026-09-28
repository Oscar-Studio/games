#!/bin/bash
# 双击启动本地服务器并打开浏览器
cd "$(dirname "$0")" || exit 1
PORT=8899
while lsof -i :$PORT >/dev/null 2>&1; do PORT=$((PORT+1)); done
echo "NEON PULSE → http://localhost:$PORT"
( sleep 1; open "http://localhost:$PORT" ) &
python3 -m http.server $PORT
