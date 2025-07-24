# 配置管理系統

## 概述

後端服務現在支援動態配置管理，可以從遠端 CDN 載入合約地址和其他配置，減少環境變數的依賴。

## 功能特點

1. **動態載入配置**
   - 從 CDN 載入最新的合約地址
   - 5 分鐘緩存機制，避免頻繁請求
   - 環境變數作為備份方案

2. **配置優先級**
   - 優先使用 CDN 配置
   - CDN 不可用時使用環境變數
   - 支援手動刷新配置

3. **簡化部署**
   - 減少 Render 上的環境變數數量
   - 更新配置無需重新部署

## 配置文件位置

- **CDN URL**: `https://dungeondelvers.xyz/config/v18.json`
- **本地開發**: 自動使用前端專案的配置文件

## API 端點

### 健康檢查
```bash
GET /health
```
顯示當前載入的配置版本和來源。

### 刷新配置
```bash
POST /api/config/refresh
```
手動刷新配置，立即從 CDN 重新載入。

## 環境變數

### 必要的環境變數（Render）

```bash
# 基本設定
NODE_ENV=production
PORT=3001

# 配置 URL（可選，有默認值）
CONFIG_URL=https://dungeondelvers.xyz/config/v18.json

# The Graph（如果 CDN 配置中沒有）
THE_GRAPH_API_URL=https://api.studio.thegraph.com/query/115633/dungeon-delvers/v3.0.9

# CORS
CORS_ORIGIN=https://dungeondelvers.xyz,https://www.dungeondelvers.xyz

# 前端域名
FRONTEND_DOMAIN=https://dungeondelvers.xyz
```

### 備份合約地址（可選）

如果 CDN 配置無法載入，系統會使用這些環境變數：

```bash
HERO_ADDRESS=0x6E4dF8F5413B42EC7b82D2Bc20254Db5A11DB374
RELIC_ADDRESS=0x40e001D24aD6a28FC40870901DbF843D921fe56C
PARTY_ADDRESS=0xb26466A44f51CfFF8C13837dA8B2aD6BA82c62dF
VIPSTAKING_ADDRESS=0xe4B6C86748b49D91ac635A56a9DF25af963F8fdd
PLAYERPROFILE_ADDRESS=0xE5E85233082827941A9E9cb215bDB83407d7534b
```

## 測試配置載入

```bash
# 測試配置載入器
npm run test:config
```

## 更新流程

1. **更新配置文件**
   - 編輯 `/Documents/GitHub/DungeonDelvers/public/config/v18.json`
   - 部署前端到 Vercel

2. **後端自動更新**
   - 5 分鐘後自動載入新配置
   - 或調用 `/api/config/refresh` 立即更新

3. **驗證更新**
   - 訪問 `/health` 查看配置版本
   - 確認合約地址已更新

## 故障排除

### 配置載入失敗
- 檢查 CDN URL 是否可訪問
- 確認配置文件格式正確
- 查看服務器日誌

### 環境變數優先
如果需要強制使用環境變數而非 CDN 配置：
1. 不設定 `CONFIG_URL`
2. 設定所有必要的合約地址環境變數

## 優點

1. **減少環境變數**：從 20+ 個減少到 5-6 個
2. **快速更新**：無需重新部署即可更新配置
3. **統一管理**：與前端共用同一配置文件
4. **自動同步**：配置更新自動生效