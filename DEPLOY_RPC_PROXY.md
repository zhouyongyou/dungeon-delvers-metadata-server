# 部署 RPC 代理功能指南

## 背景
後端已經實現了 RPC 代理功能，前端已經配置好使用代理，但後端尚未部署最新代碼。

## 部署步驟

### 1. 確認環境變數（Render.com）
確保在 Render.com 設置了以下環境變數：
- `ALCHEMY_BSC_MAINNET_RPC_URL` - 你的 Alchemy API URL（已設置）
- `BSC_MAINNET_RPC_URL` - 備用 RPC URL（已設置）
- `CORS_ORIGIN` - 允許的來源（已設置）

### 2. 部署後端代碼
1. 提交最新的代碼到 Git：
```bash
cd /Users/sotadic/Documents/dungeon-delvers-metadata-server
git add .
git commit -m "Fix RPC proxy environment variable names"
git push
```

2. Render.com 會自動部署新代碼

### 3. 驗證部署
部署完成後（約 5-10 分鐘），測試以下端點：

```bash
# 測試 RPC 狀態
curl https://dungeondelvers-backend.onrender.com/api/rpc/status

# 測試 RPC 代理
curl -X POST https://dungeondelvers-backend.onrender.com/api/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

### 4. 前端配置確認
前端 `.env` 已經設置：
```
VITE_USE_RPC_PROXY=true
VITE_METADATA_SERVER_URL=https://dungeondelvers-backend.onrender.com
```

### 5. 監控
使用前端的 RPC 監控面板查看：
- 請求是否通過代理
- 響應時間
- 成功率

## 預期結果
- RPC 請求不再暴露 Alchemy API key
- 使用私人節點提高性能
- 使用輪替機制分散請求負載
- 已移除公共節點健康檢查，完全依賴 Alchemy 私人節點

## 故障排除
1. 如果 404 錯誤：檢查部署是否成功
2. 如果 500 錯誤：檢查環境變數是否正確
3. 如果超時：檢查 Alchemy API 配額