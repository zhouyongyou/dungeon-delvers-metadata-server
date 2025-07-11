#!/bin/bash

# 簡化的部署腳本
echo "🚀 開始簡化部署..."

# 安裝依賴
echo "📦 安裝依賴..."
npm install

# 檢查環境變數
if [ ! -f .env ]; then
    echo "❌ .env 文件不存在，創建示例文件..."
    cat > .env << EOF
VITE_THE_GRAPH_STUDIO_API_URL=https://api.studio.thegraph.com/query/your-subgraph-url
PORT=3001
EOF
    echo "⚠️  請編輯 .env 文件並設置正確的 GraphQL URL"
fi

# 啟動服務
echo "�� 啟動服務..."
npm start 