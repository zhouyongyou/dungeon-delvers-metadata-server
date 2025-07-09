#!/bin/bash

# 部署腳本 - Dungeon Delvers Metadata Server

set -e

echo "🚀 Starting deployment process..."

# 檢查 .env 文件是否存在
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please copy .env.example to .env and fill in the values."
    exit 1
fi

# 構建 Docker 映像
echo "🔨 Building Docker image..."
docker build -t dungeon-delvers-metadata-server .

# 停止現有容器（如果存在）
echo "🛑 Stopping existing containers..."
docker-compose down || true

# 啟動新容器
echo "🎯 Starting new containers..."
docker-compose up -d

# 等待服務啟動
echo "⏳ Waiting for service to be ready..."
sleep 10

# 檢查健康狀態
echo "🔍 Checking health status..."
for i in {1..30}; do
    if curl -f http://localhost:3001/health > /dev/null 2>&1; then
        echo "✅ Service is healthy!"
        break
    fi
    echo "⏳ Waiting for service... (attempt $i/30)"
    sleep 2
done

# 檢查是否成功啟動
if ! curl -f http://localhost:3001/health > /dev/null 2>&1; then
    echo "❌ Service failed to start properly"
    echo "📋 Container logs:"
    docker-compose logs
    exit 1
fi

echo "🎉 Deployment completed successfully!"
echo "📍 Service is running at: http://localhost:3001"
echo "💊 Health check: http://localhost:3001/health"