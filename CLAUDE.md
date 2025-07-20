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

## 環境變數
```bash
# 環境設置
NODE_ENV=production  # Render 上使用
TEST_MODE=false      # 生產環境關閉
PORT=3001           # 本地開發，Render 自動分配

# V12 合約地址
DUNGEONCORE_ADDRESS=0x2CB2Bd1b18CDd0cbF37cD6F7FF672D03E7a038a5
DUNGEONMASTER_ADDRESS=0xb71f6ED7B13452a99d740024aC17470c1b4F0021
# ... 其他合約地址

# API Keys
ALCHEMY_API_KEY_1=你的KEY1
ALCHEMY_API_KEY_2=你的KEY2
# ...

# The Graph
THE_GRAPH_API_URL=https://api.studio.thegraph.com/query/115633/dungeon-delvers/v3.0.5

# CORS
CORS_ORIGIN=https://dungeondelvers.xyz,https://www.dungeondelvers.xyz
```

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