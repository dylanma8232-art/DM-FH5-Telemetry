#!/bin/bash
echo "开始监听 Forza 遥测数据..."
echo "按 Ctrl+C 停止"
echo ""

while true; do
    data=$(curl -s http://localhost:9188/api/current 2>/dev/null)
    if [ ! -z "$data" ]; then
        echo "$data" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    if d.get('isRaceOn'):
        print(f'比赛进行中 | 速度: {d[\"speedKmh\"]:.1f} km/h | RPM: {d[\"currentEngineRpm\"]:.0f} | 档位: {d[\"controls\"][\"gear\"]} | 位置: ({d[\"position\"][\"x\"]:.1f}, {d[\"position\"][\"y\"]:.1f}, {d[\"position\"][\"z\"]:.1f})')
    else:
        print(f'等待中... | timestamp: {d.get(\"timestampMS\", 0)}')
except:
    pass
"
    fi
    sleep 0.5
done
