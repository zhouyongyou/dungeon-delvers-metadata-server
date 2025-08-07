# 🚀 DungeonDelvers 後端 - 專案指南

> 📖 **請先閱讀**: `~/MASTER-CLAUDE.md` 了解整體架構，此文檔專注於後端開發細節

## 🗂️ 快速導航
```bash
# 當前專案
/Users/sotadic/Documents/dungeon-delvers-metadata-server/    # Node.js 後端 API

# 其他專案
/Users/sotadic/Documents/DungeonDelversContracts/                    # 智能合約
/Users/sotadic/Documents/GitHub/DungeonDelvers/                     # React 前端
/Users/sotadic/Documents/GitHub/DungeonDelvers/DDgraphql/dungeon-delvers/  # 子圖
```

## 專案概述
DungeonDelvers 的 Node.js 後端服務，提供 NFT metadata、遊戲邏輯和 API 端點。

## 技術棧
- **框架**: Express.js
- **語言**: JavaScript (Node.js)
- **區塊鏈**: ethers.js v6
- **部署**: Render

## 🔄 統一配置管理系統

### 🎯 重要：後端配置由合約項目統一管理
後端**不應該**直接編輯合約配置文件，所有合約相關配置由合約項目自動同步。

### 📍 配置文件位置
- **主配置來源**：`/Users/sotadic/Documents/DungeonDelversContracts/.env.v25`
- **後端配置文件**：`/Users/sotadic/Documents/dungeon-delvers-metadata-server/config/contracts.json` （自動生成）

### 🚀 配置同步流程

#### 當需要更新合約地址時：
```bash
# ❌ 錯誤：不要直接編輯後端合約配置
# vim /Users/sotadic/Documents/dungeon-delvers-metadata-server/config/contracts.json

# ✅ 正確：編輯主配置文件
vim /Users/sotadic/Documents/DungeonDelversContracts/.env.v25

# ✅ 然後執行同步
cd /Users/sotadic/Documents/DungeonDelversContracts
node scripts/ultimate-config-system.js sync
```

#### 同步後重啟後端服務器：
```bash
# 本地開發
cd /Users/sotadic/Documents/dungeon-delvers-metadata-server
npm run dev

# 或生產環境會自動重啟
```

### 📋 自動同步的配置內容
- ✅ **合約地址**：所有合約地址轉換為 camelCase 格式
- ✅ **網路配置**：鏈 ID、RPC URL
- ✅ **VRF 配置**：完整的 VRF 設定參數
- ✅ **服務端點**：子圖 URL 和版本信息
- ✅ **部署信息**：版本標籤、部署時間、起始區塊

### 🔍 驗證配置正確性
```bash
# 檢查後端配置是否與主配置一致
cd /Users/sotadic/Documents/DungeonDelversContracts
node scripts/ultimate-config-system.js validate
```

### 🛠️ 後端專用環境變數
以下配置**不會**被自動同步，需要手動維護：
```bash
# .env 文件 - 後端服務專用配置
NODE_ENV=production
CORS_ORIGIN=https://dungeondelvers.xyz,https://www.dungeondelvers.xyz
FRONTEND_DOMAIN=https://dungeondelvers.xyz
PORT=3000  # Render 自動設定

# 可選配置
CONFIG_URL=https://dungeondelvers.xyz/config/v25.json  # CDN 配置位置
LOG_LEVEL=info
MAX_CACHE_SIZE=1000
```

### ⚡ 動態配置載入
後端使用以下機制載入配置：
- **JSON 配置讀取**：`config/contracts.json` 提供合約地址和網路配置
- **環境變數覆蓋**：支援環境變數覆蓋 JSON 配置
- **緩存機制**：5分鐘緩存 + 自動重新載入
- **健康檢查**：`/api/config/status` 端點顯示配置狀態

### 🔄 配置刷新機制
```bash
# 手動刷新配置（開發時使用）
curl -X POST http://localhost:3000/api/config/refresh

# 檢查配置狀態
curl http://localhost:3000/api/config/status
```

### 🚨 關鍵提醒
1. **永遠不要**手動編輯 `config/contracts.json` 合約地址
2. **配置變更後**重啟後端服務器或調用刷新 API
3. **部署前**確保 `npm start` 成功啟動
4. **生產環境**配置變更會觸發服務自動重啟

## 📚 API 端點設計

### 核心 Metadata API
```javascript
// NFT Metadata 生成
GET /metadata/:type/:id

// 範例:
GET /metadata/hero/123     // 英雄 #123 的 metadata
GET /metadata/relic/456    // 聖物 #456 的 metadata
GET /metadata/party/789    // 隊伍 #789 的 metadata
GET /metadata/vip/101      // VIP #101 的 metadata
```

### 系統端點
```javascript
// 健康檢查
GET /health

// 配置管理
POST /api/config/refresh   // 手動刷新配置
GET /api/config/status     // 查看配置狀態
```

### 將來擴展 API
```javascript
// 遊戲統計 (TODO)
GET /api/stats/heroes      // 英雄統計
GET /api/stats/leaderboard // 排行榜

// 用戶数據 (TODO)
GET /api/user/:address     // 用戶資料
GET /api/user/:address/nfts // 用戶 NFT 列表
```

## 🛠️ 開發指令

```bash
# 安裝依賴
npm install

# 本地開發 (自動重載)
npm run dev

# 生產環境
npm start

# 測試
npm test
npm run test:watch
npm run test:coverage

# 程式碼檢查
npm run lint
npm run lint:fix
```

## 📝 中間件與工具

### 請求處理中間件
```javascript
// CORS 配置
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true
}));

// JSON 處理
app.use(express.json({ limit: '10mb' }));

// 安全頭
app.use(helmet());
```

### 錯誤處理
```javascript
// 全域錯誤處理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});
```

### 記錄系統
```javascript
// Morgan 記錄設定
app.use(morgan('combined'));

// 自定義記錄等級
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`)
};
```

## 📊 性能優化

### 緩存策略
```javascript
// Metadata 緩存 (5 分鐘)
const metadataCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;

// 配置緩存 (5 分鐘)
let configCache = null;
let configCacheTime = 0;
```

### 速率限制
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 100, // 每 IP 最多 100 次請求
  message: 'Too many requests from this IP'
});

app.use('/api/', limiter);
```

### 壓縮設定
```javascript
const compression = require('compression');
app.use(compression());
```

## 🔒 安全最佳實踐

### 輸入驗證
```javascript
const validateTokenId = (req, res, next) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid token ID' });
  }
  req.tokenId = parseInt(id);
  next();
};

const validateNFTType = (req, res, next) => {
  const { type } = req.params;
  const validTypes = ['hero', 'relic', 'party', 'vip'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid NFT type' });
  }
  next();
};
```

### 環境變數驗證
```javascript
// 启動時驗證必要配置
const requiredEnvVars = ['NODE_ENV', 'CORS_ORIGIN'];
requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`Missing required environment variable: ${varName}`);
    process.exit(1);
  }
});
```

## 🚀 部署指南

### Render 部署設定
```bash
# Build Command
npm install

# Start Command  
npm start

# 環境變數
NODE_ENV=production
CORS_ORIGIN=https://dungeondelvers.xyz,https://www.dungeondelvers.xyz
FRONTEND_DOMAIN=https://dungeondelvers.xyz
```

### 本地開發設定
```bash
# .env.local
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
FRONTEND_DOMAIN=http://localhost:5173
CONFIG_URL=file:///path/to/local/config.json
```

### Docker 支援 (TODO)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🗺️ API 路由結構

```
src/
├── app.js              # 主應用程式
├── routes/
│   ├── metadata.js     # NFT metadata 端點
│   ├── health.js       # 健康檢查
│   └── config.js       # 配置管理
├── middleware/
│   ├── auth.js         # 認證中間件
│   ├── validation.js   # 輸入驗證
│   └── rateLimit.js    # 速率限制
├── utils/
│   ├── configLoader.js # 配置載入器
│   ├── svgGenerator.js # SVG 生成器
│   └── logger.js       # 記錄工具
└── tests/              # 測試文件
```

## 🧪 測試策略

### 單元測試
```javascript
// Jest + Supertest
const request = require('supertest');
const app = require('../src/app');

describe('Metadata API', () => {
  test('GET /metadata/hero/123', async () => {
    const response = await request(app)
      .get('/metadata/hero/123')
      .expect(200);
    
    expect(response.body).toHaveProperty('name');
    expect(response.body).toHaveProperty('image');
  });
});
```

### 集成測試
```bash
# 測試指令
npm test              # 運行所有測試
npm run test:watch    # 監視模式
npm run test:coverage # 測試覆蓋率
```

## 🔍 監控與診斷

### 健康檢查端點
```javascript
GET /health
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 12345,
  "config": {
    "version": "V25",
    "lastUpdated": "2025-08-01T..."
  }
}
```

### 錯誤追蹤
```javascript
// 使用 winston 或 pino
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' })
  ]
});
```

## 🔎 常見問題與解決

### 部署問題
- **端口衝突**: Render 自動設定 PORT，不要硬編碼
- **CORS 錯誤**: 檢查 CORS_ORIGIN 環境變數設定
- **配置載入失敗**: 確認 CDN URL 可訪問

### 性能問題
- **轉換緩慢**: 考慮使用 Redis 作為外部緩存
- **記憶體溢出**: 設定緩存上限和清理機制
- **CPU 使用過高**: 優化 SVG 生成算法

### API 錯誤
- **404 錯誤**: 檢查路由設定和 NFT ID 有效性
- **500 錯誤**: 查看伺服器記錄，檢查合約連接
- **超時**: 設定合理的請求超時時間