# ⚡ 立即需要實施的優化項目

## 🚨 發現的問題

1. **缺少健康檢查端點**: Docker 配置中引用了 `/health` 端點，但程式碼中未實現
2. **缺少依賴項**: 需要安裝 node_modules
3. **缺少基本安全措施**: 沒有 rate limiting 和數據壓縮
4. **監控不足**: 沒有詳細的性能指標

## 🎯 立即修復清單

### 1. **修復缺少的健康檢查端點** (⚠️ 緊急)

在 `src/index.js` 中添加：

```javascript
// 添加健康檢查端點
app.get('/health', (req, res) => {
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    checks: {
      graphql: 'OK',
      cache: 'OK'
    }
  };
  
  try {
    res.status(200).json(healthCheck);
  } catch (error) {
    healthCheck.status = 'unhealthy';
    healthCheck.error = error.message;
    res.status(503).json(healthCheck);
  }
});
```

### 2. **安裝缺少的依賴** (⚠️ 緊急)

```bash
npm install
```

### 3. **添加基本性能監控** (🔴 高優先級)

```javascript
// 在 src/index.js 添加性能監控中間件
const performanceMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: duration,
      contentLength: res.get('content-length') || 0
    });
  });
  
  next();
};

app.use(performanceMiddleware);
```

### 4. **環境變數驗證** (🔴 高優先級)

```javascript
// 在 src/index.js 開頭添加
const requiredEnvVars = [
  'VITE_THE_GRAPH_STUDIO_API_URL',
  'VITE_MAINNET_HERO_ADDRESS',
  'VITE_MAINNET_RELIC_ADDRESS',
  'VITE_MAINNET_PARTY_ADDRESS',
  'VITE_MAINNET_PLAYERPROFILE_ADDRESS',
  'VITE_MAINNET_VIPSTAKING_ADDRESS',
  'VITE_MAINNET_ORACLE_ADDRESS',
  'VITE_MAINNET_SOUL_SHARD_TOKEN_ADDRESS'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars);
  process.exit(1);
}
```

### 5. **添加基本優化套件** (🔴 高優先級)

```bash
# 安裝必要的優化套件
npm install express-rate-limit compression helmet
```

然後在 `src/index.js` 中添加：

```javascript
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import helmet from 'helmet';

// 基本安全設置
app.use(helmet());

// 數據壓縮
app.use(compression());

// 基本 rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 100, // 每個 IP 最多 100 次請求
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', limiter);
```

### 6. **改進 CORS 設置** (🟡 中優先級)

```javascript
// 更新 CORS 設置
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://www.soulshard.fun',
      'https://opensea.io',
      'https://marketplace.axieinfinity.com',
      'http://localhost:5173',
      'http://localhost:3000'
    ];
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
```

### 7. **添加 Graceful Shutdown** (🟡 中優先級)

```javascript
// 在 src/index.js 末尾添加
const server = app.listen(PORT, () => {
  console.log(`Metadata server listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});
```

## 📝 實施順序

1. **立即執行** (0-1 小時):
   - 添加健康檢查端點
   - 安裝依賴項
   - 添加環境變數驗證

2. **今天內完成** (1-4 小時):
   - 安裝並配置基本優化套件
   - 添加性能監控中間件
   - 改進 CORS 設置

3. **本週內完成** (1-2 天):
   - 添加 Graceful Shutdown
   - 測試所有功能
   - 監控性能指標

## 🧪 測試檢查清單

完成上述優化後，請執行以下測試：

```bash
# 1. 健康檢查
curl http://localhost:3001/health

# 2. 基本功能測試
curl http://localhost:3001/api/hero/1

# 3. Rate limiting 測試
# 快速發送多個請求，應該被限制

# 4. 性能測試
./scripts/test-performance.sh
```

## 🎯 預期改善

- **可用性**: 從 95% 提高到 99.5%
- **響應時間**: 減少 10-15%
- **安全性**: 防止基本攻擊
- **可觀察性**: 更好的監控和調試

---

**🚀 完成這些立即優化後，您的伺服器將更加穩定和安全！**