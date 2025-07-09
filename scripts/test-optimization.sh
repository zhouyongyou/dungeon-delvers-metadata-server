#!/bin/bash

# 🚀 Dungeon Delvers v3.0 優化測試腳本
# 此腳本用於測試所有實施的優化項目

echo "🔍 開始測試 Dungeon Delvers v3.0 優化項目..."
echo "==============================================="

# 設置變數
SERVER_URL="http://localhost:3001"
HEALTH_ENDPOINT="$SERVER_URL/health"

# 1. 測試健康檢查端點
echo "1. 測試健康檢查端點..."
if curl -s "$HEALTH_ENDPOINT" > /dev/null; then
    echo "✅ 健康檢查端點正常運行"
    echo "📊 健康檢查回應:"
    curl -s "$HEALTH_ENDPOINT" | jq '.'
else
    echo "❌ 健康檢查端點無法連接"
fi

echo ""

# 2. 測試 Rate Limiting
echo "2. 測試 Rate Limiting..."
echo "📡 發送多個請求測試限制..."
for i in {1..5}; do
    STATUS=$(curl -s -w "%{http_code}" -o /dev/null "$HEALTH_ENDPOINT")
    echo "  請求 $i: HTTP $STATUS"
done

echo ""

# 3. 測試 CORS Headers
echo "3. 測試 CORS Headers..."
echo "🌐 檢查 CORS 設置..."
curl -s -I -H "Origin: https://opensea.io" "$HEALTH_ENDPOINT" | grep -i cors || echo "CORS headers 可能未正確配置"

echo ""

# 4. 測試安全 Headers
echo "4. 測試安全 Headers..."
echo "🛡️ 檢查安全 Headers..."
HEADERS=$(curl -s -I "$HEALTH_ENDPOINT")
echo "$HEADERS" | grep -i "x-frame-options" && echo "✅ X-Frame-Options 已設置" || echo "❌ X-Frame-Options 未設置"
echo "$HEADERS" | grep -i "x-content-type-options" && echo "✅ X-Content-Type-Options 已設置" || echo "❌ X-Content-Type-Options 未設置"

echo ""

# 5. 測試壓縮
echo "5. 測試 Gzip 壓縮..."
echo "📦 檢查響應壓縮..."
curl -s -H "Accept-Encoding: gzip" -I "$HEALTH_ENDPOINT" | grep -i "content-encoding: gzip" && echo "✅ Gzip 壓縮已啟用" || echo "❌ Gzip 壓縮未啟用"

echo ""

# 6. 測試 API 端點 (需要真實環境變數)
echo "6. 測試 API 端點 (需要配置環境變數)..."
if [ -f ".env" ]; then
    echo "📝 發現 .env 文件，嘗試測試 API 端點..."
    
    # 測試 Hero 端點
    echo "  測試 Hero 端點..."
    curl -s -w "Status: %{http_code}, Time: %{time_total}s\n" -o /dev/null "$SERVER_URL/api/hero/1"
    
    # 測試 Relic 端點
    echo "  測試 Relic 端點..."
    curl -s -w "Status: %{http_code}, Time: %{time_total}s\n" -o /dev/null "$SERVER_URL/api/relic/1"
    
else
    echo "❌ 未找到 .env 文件，請先設置環境變數"
    echo "💡 運行: cp .env.example .env 然後編輯 .env 文件"
fi

echo ""

# 7. 依賴項檢查
echo "7. 檢查依賴項狀態..."
echo "📦 檢查 npm 依賴項..."
if npm list --depth=0 2>/dev/null | grep -q "UNMET DEPENDENCY"; then
    echo "❌ 發現未滿足的依賴項"
    npm list --depth=0
else
    echo "✅ 所有依賴項已正確安裝"
fi

echo ""

# 8. 性能測試
echo "8. 簡單性能測試..."
echo "⏱️ 測試響應時間..."
curl -s -w "健康檢查響應時間: %{time_total}s\n" -o /dev/null "$HEALTH_ENDPOINT"

echo ""

# 總結
echo "==============================================="
echo "🎯 測試完成！"
echo ""
echo "📋 檢查清單："
echo "- [ ] 健康檢查端點運行正常"
echo "- [ ] Rate Limiting 正確設置"
echo "- [ ] CORS Headers 已配置"
echo "- [ ] 安全 Headers 已啟用"
echo "- [ ] Gzip 壓縮已啟用"
echo "- [ ] API 端點可正常訪問"
echo "- [ ] 所有依賴項已安裝"
echo ""
echo "🚀 如果所有測試都通過，您的伺服器已成功優化！"
echo "💡 下一步：配置 .env 文件並填入真實的合約地址"