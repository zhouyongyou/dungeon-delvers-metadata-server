#!/bin/bash

# 測試 Render 部署的 RPC 代理
echo "🔍 測試 Render 部署的 RPC 代理..."

# 等待部署完成
echo "⏳ 等待部署完成..."
sleep 30

# 檢查健康狀態
echo "🏥 檢查健康狀態..."
curl -s https://dungeon-delvers-metadata-server.onrender.com/health | jq '.status'

# 檢查 RPC 狀態
echo "📊 檢查 RPC 狀態..."
RESPONSE=$(curl -s https://dungeon-delvers-metadata-server.onrender.com/api/rpc/status)
echo "$RESPONSE" | jq '.summary'

# 檢查是否使用輪替機制
MODE=$(echo "$RESPONSE" | jq -r '.summary.mode')
if [[ "$MODE" == "round-robin" ]]; then
    echo "✅ 成功！正在使用 Alchemy API Keys 輪替機制"
    CURRENT_INDEX=$(echo "$RESPONSE" | jq -r '.summary.currentIndex')
    TOTAL=$(echo "$RESPONSE" | jq -r '.summary.total')
    echo "📍 當前索引: $CURRENT_INDEX / 總數: $TOTAL"
else
    echo "⚠️  未使用輪替機制，請檢查配置"
fi

# 測試 RPC 請求
echo "📡 測試 RPC 請求..."
RPC_RESPONSE=$(curl -s -X POST "https://dungeon-delvers-metadata-server.onrender.com/api/rpc" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}')

if echo "$RPC_RESPONSE" | jq -e '.result' > /dev/null; then
    BLOCK_NUMBER=$(echo "$RPC_RESPONSE" | jq -r '.result')
    BLOCK_DECIMAL=$((16#${BLOCK_NUMBER:2}))
    echo "✅ RPC 請求成功！當前區塊號: $BLOCK_DECIMAL"
else
    echo "❌ RPC 請求失敗"
    echo "$RPC_RESPONSE" | jq '.'
fi

echo "🎉 測試完成！"