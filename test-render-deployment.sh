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

# 檢查最佳節點
BEST_NODE=$(echo "$RESPONSE" | jq -r '.bestNode')
echo "🎯 當前最佳節點: $BEST_NODE"

# 判斷是否使用私人節點
if [[ "$BEST_NODE" == *"alchemy.com"* ]]; then
    echo "✅ 成功！正在使用 Alchemy 私人節點"
elif [[ "$BEST_NODE" == *"infura.io"* ]]; then
    echo "✅ 成功！正在使用 Infura 私人節點"
else
    echo "⚠️  當前使用公共節點，請檢查環境變數設置"
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