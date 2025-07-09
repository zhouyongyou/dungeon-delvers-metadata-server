#!/bin/bash

# 性能測試腳本 - Dungeon Delvers Metadata Server

set -e

SERVER_URL="http://localhost:3001"
TOTAL_REQUESTS=50
CONCURRENT_REQUESTS=5

echo "🧪 Starting performance test..."
echo "📊 Server: $SERVER_URL"
echo "📊 Total requests: $TOTAL_REQUESTS"
echo "📊 Concurrent requests: $CONCURRENT_REQUESTS"

# 檢查服務是否運行
if ! curl -f "$SERVER_URL/health" > /dev/null 2>&1; then
    echo "❌ Server is not running at $SERVER_URL"
    echo "💡 Try running: npm start or ./scripts/deploy.sh"
    exit 1
fi

# 測試端點
endpoints=(
    "/api/hero/1"
    "/api/relic/1"
    "/api/party/1"
    "/api/playerprofile/1"
    "/api/vipstaking/1"
)

echo "🔍 Testing endpoints..."

for endpoint in "${endpoints[@]}"; do
    echo "📍 Testing $endpoint"
    
    # 第一次請求（冷啟動）
    echo "❄️  Cold start:"
    time curl -s "$SERVER_URL$endpoint" > /dev/null
    
    # 第二次請求（緩存命中）
    echo "🔥 Cache hit:"
    time curl -s "$SERVER_URL$endpoint" > /dev/null
    
    echo "---"
done

# 使用 ab (Apache Bench) 進行負載測試（如果可用）
if command -v ab &> /dev/null; then
    echo "🚀 Running load test with Apache Bench..."
    ab -n $TOTAL_REQUESTS -c $CONCURRENT_REQUESTS "$SERVER_URL/api/hero/1"
else
    echo "💡 Install Apache Bench (apache2-utils) for detailed load testing"
fi

echo "✅ Performance test completed!"