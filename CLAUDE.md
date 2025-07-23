# DungeonDelvers 後端 - AI 開發指南

## 🗂️ 專案資料夾位置
```bash
# 後端（當前資料夾）
/Users/sotadic/Documents/dungeon-delvers-metadata-server/

# 前端
/Users/sotadic/Documents/GitHub/DungeonDelvers/

# 智能合約
/Users/sotadic/Documents/DungeonDelversContracts/

# 子圖
/Users/sotadic/Documents/GitHub/DungeonDelvers/DDgraphql/dungeon-delvers/
```

## 專案概述
DungeonDelvers 的 Node.js 後端服務，提供 NFT metadata、遊戲邏輯和 API 端點。

## 技術棧
- **框架**: Express.js
- **語言**: JavaScript (Node.js)
- **區塊鏈**: ethers.js v6
- **部署**: Render

## 環境變數（2025-07-23 簡化版）
```bash
# Render 上只需要這些環境變數！
NODE_ENV=production
CORS_ORIGIN=https://dungeondelvers.xyz,https://www.dungeondelvers.xyz
FRONTEND_DOMAIN=https://dungeondelvers.xyz

# 可選（有默認值）
CONFIG_URL=https://dungeondelvers.xyz/config/v15.json

# 不再需要設置合約地址！
# 所有地址從 CDN 配置自動載入
```

## 🔄 配置管理系統

### 動態配置載入
後端現在使用 `configLoader.js` 自動載入配置：
- 從 CDN 載入所有合約地址
- 5 分鐘緩存機制
- 環境變數作為備份

### 配置載入優先級
1. CDN 配置（優先）
2. 環境變數（備份）
3. 內建默認值

### API 端點
- `POST /api/config/refresh` - 手動刷新配置
- `GET /health` - 查看當前配置版本

### 開發環境
```bash
# 本地開發時可用
CONFIG_URL=file:///path/to/local/config.json
NODE_ENV=development
```

### 配置更新流程
1. 前端部署新的 CDN 配置
2. 後端自動在 5 分鐘內載入
3. 或調用 `/api/config/refresh` 立即更新
4. 無需重新部署後端！

## 主要端點
- `/metadata/:type/:id` - NFT metadata
- `/health` - 健康檢查
- `/api/` - 各種 API 端點

## 開發命令
```bash
# 安裝依賴
npm install

# 本地開發
npm run dev

# 生產環境
npm start
```

## 部署注意事項
1. Render 會自動設置 PORT
2. 確保 NODE_ENV=production
3. 更新合約地址時記得同步更新環境變數