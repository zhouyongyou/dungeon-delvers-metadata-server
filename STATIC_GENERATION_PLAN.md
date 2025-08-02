# 🗂️ Hero/Relic 靜態化方案設計

## 📋 方案概述

由於 Hero 和 Relic NFT 的數據是靜態的（稀有度、power、capacity 等屬性不會改變），我們可以預生成這些 NFT 的 metadata JSON 文件，實現極致的訪問性能。

## 🎯 預期效果

- **響應時間**: 從 1-2 秒降低到 10-50ms
- **伺服器負載**: 減少 80% 的動態生成請求
- **CDN 友好**: 靜態文件可完全緩存
- **可擴展性**: 支持數萬個 NFT 而無性能損失

## 🏗️ 架構設計

### 1. 文件結構
```
static/
├── metadata/
│   ├── hero/
│   │   ├── 1.json
│   │   ├── 2.json
│   │   └── ...
│   ├── relic/
│   │   ├── 1.json
│   │   ├── 2.json
│   │   └── ...
│   └── index/
│       ├── heroes.json      # Hero 列表索引
│       ├── relics.json      # Relic 列表索引
│       └── last_update.json # 最後更新時間
└── cache/
    └── temp/               # 臨時生成文件
```

### 2. 生成器腳本
```javascript
// scripts/generate-static-metadata.js
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

class StaticMetadataGenerator {
  constructor() {
    this.outputDir = path.join(__dirname, '../static/metadata');
    this.batchSize = 50; // 批量處理大小
  }

  async generateAll() {
    console.log('🚀 開始生成靜態 metadata 文件');
    
    // 創建目錄結構
    await this.ensureDirectories();
    
    // 獲取已存在的 NFT 列表
    const heroes = await this.getExistingNFTs('hero');
    const relics = await this.getExistingNFTs('relic');
    
    // 批量生成 Heroes
    await this.generateBatch('hero', heroes);
    
    // 批量生成 Relics
    await this.generateBatch('relic', relics);
    
    // 生成索引文件
    await this.generateIndexFiles(heroes, relics);
    
    console.log('✅ 靜態文件生成完成');
  }

  async generateBatch(type, tokenIds) {
    console.log(`📦 生成 ${type} metadata (${tokenIds.length} 個)`);
    
    for (let i = 0; i < tokenIds.length; i += this.batchSize) {
      const batch = tokenIds.slice(i, i + this.batchSize);
      
      await Promise.allSettled(
        batch.map(tokenId => this.generateSingle(type, tokenId))
      );
      
      console.log(`✅ 完成批次 ${Math.floor(i/this.batchSize) + 1}/${Math.ceil(tokenIds.length/this.batchSize)}`);
    }
  }

  async generateSingle(type, tokenId) {
    try {
      // 檢查文件是否已存在且較新
      const filePath = path.join(this.outputDir, type, `${tokenId}.json`);
      if (await this.isFileUpToDate(filePath)) {
        return;
      }

      // 獲取 NFT 數據
      const metadata = await this.fetchNFTMetadata(type, tokenId);
      
      // 寫入文件
      await fs.promises.writeFile(filePath, JSON.stringify(metadata, null, 2));
      
      console.log(`✅ 生成: ${type} #${tokenId}`);
    } catch (error) {
      console.error(`❌ 生成失敗: ${type} #${tokenId}`, error.message);
    }
  }
}
```

### 3. 增量更新機制
```javascript
// scripts/incremental-update.js
class IncrementalUpdater {
  async updateNewNFTs() {
    // 獲取最後更新時間
    const lastUpdate = await this.getLastUpdateTime();
    
    // 查詢新鑄造的 NFT
    const newNFTs = await this.getNewNFTsSince(lastUpdate);
    
    // 只生成新的 NFT
    for (const nft of newNFTs) {
      await this.generateSingle(nft.type, nft.tokenId);
    }
    
    // 更新時間戳
    await this.updateLastUpdateTime();
  }
}
```

## ⚡ 服務端整合

### 1. 路由修改
```javascript
// 在 index.js 中修改路由處理
app.get('/api/:type/:tokenId', async (req, res) => {
  const { type, tokenId } = req.params;
  
  // 對於 Hero 和 Relic，優先使用靜態文件
  if (['hero', 'relic'].includes(type)) {
    const staticFile = path.join(__dirname, '../static/metadata', type, `${tokenId}.json`);
    
    try {
      if (fs.existsSync(staticFile)) {
        const metadata = JSON.parse(fs.readFileSync(staticFile, 'utf8'));
        
        // 添加快取標頭
        res.set({
          'Cache-Control': 'public, max-age=31536000', // 1 年
          'X-Cache-Status': 'STATIC-HIT',
          'X-Source': 'static-file'
        });
        
        return res.json(metadata);
      }
    } catch (error) {
      console.warn(`靜態文件讀取失敗: ${type}/${tokenId}`, error.message);
    }
  }
  
  // 回退到動態生成
  return handleDynamicMetadata(req, res);
});
```

### 2. 自動更新任務
```javascript
// 添加定時任務
const cron = require('node-cron');

// 每小時檢查新 NFT
cron.schedule('0 * * * *', async () => {
  console.log('🔄 執行增量更新...');
  await incrementalUpdater.updateNewNFTs();
});

// 每天凌晨 2 點完整重建（可選）
cron.schedule('0 2 * * *', async () => {
  console.log('🔄 執行完整重建...');
  await staticGenerator.generateAll();
});
```

## 📊 監控與統計

### 1. 性能指標
```javascript
const staticMetrics = {
  hits: 0,           // 靜態文件命中次數
  misses: 0,         // 靜態文件未命中次數
  errors: 0,         // 靜態文件讀取錯誤
  totalGenerated: 0, // 總生成文件數
  lastUpdate: null   // 最後更新時間
};

// 在響應中記錄指標
res.on('finish', () => {
  if (res.get('X-Cache-Status') === 'STATIC-HIT') {
    staticMetrics.hits++;
  } else {
    staticMetrics.misses++;
  }
});
```

### 2. 健康檢查端點
```javascript
app.get('/api/static/health', (req, res) => {
  res.json({
    static_files: {
      enabled: true,
      metrics: staticMetrics,
      hit_rate: (staticMetrics.hits / (staticMetrics.hits + staticMetrics.misses) * 100).toFixed(2) + '%'
    }
  });
});
```

## 🚀 部署策略

### 1. 初始生成
```bash
# 初次部署時生成所有靜態文件
npm run generate:static

# 或者分批生成避免超時
npm run generate:heroes
npm run generate:relics
```

### 2. CDN 整合
```javascript
// 配置 CDN 路徑
const CDN_BASE_URL = process.env.CDN_BASE_URL || 'https://cdn.dungeondelvers.xyz';

// 生成 CDN URL
function getStaticMetadataURL(type, tokenId) {
  return `${CDN_BASE_URL}/metadata/${type}/${tokenId}.json`;
}
```

### 3. 備援策略
- **主要**: CDN 靜態文件
- **備援 1**: 本地靜態文件
- **備援 2**: 動態生成（現有機制）

## 📝 實施計劃

### 階段 1: 基礎設施 (1-2 天)
- [ ] 創建靜態文件生成器
- [ ] 實施文件結構
- [ ] 修改路由邏輯

### 階段 2: 數據生成 (2-3 天)
- [ ] 批量生成現有 Hero NFT
- [ ] 批量生成現有 Relic NFT
- [ ] 測試文件完整性

### 階段 3: 自動化 (1 天)
- [ ] 實施增量更新
- [ ] 添加定時任務
- [ ] 配置監控

### 階段 4: 優化 (1 天)
- [ ] CDN 集成測試
- [ ] 性能基準測試
- [ ] 文檔更新

## 🔧 工具命令

```bash
# package.json scripts
{
  "generate:static": "node scripts/generate-static-metadata.js",
  "generate:heroes": "node scripts/generate-static-metadata.js --type=hero",
  "generate:relics": "node scripts/generate-static-metadata.js --type=relic",
  "update:incremental": "node scripts/incremental-update.js",
  "static:health": "curl http://localhost:3000/api/static/health"
}
```

## 📈 預期性能提升

| 指標 | 優化前 | 優化後 | 提升幅度 |
|------|--------|--------|----------|
| 響應時間 | 1-2 秒 | 10-50ms | **95%** |
| 伺服器 CPU | 中等 | 極低 | **90%** |
| 記憶體使用 | 中等 | 低 | **70%** |
| 併發能力 | 100 req/s | 1000+ req/s | **10x** |
| 快取命中率 | 60% | 95%+ | **35%** |

## ⚠️ 注意事項

1. **磁碟空間**: 每個 NFT 約 2-3KB，10,000 個 NFT 需要約 25MB
2. **同步延遲**: 新鑄造的 NFT 可能有 1 小時的延遲（可配置）
3. **數據一致性**: 靜態文件與合約數據的同步機制
4. **容錯機制**: 靜態文件損壞時的自動重建

## 🎯 成功指標

- [ ] 靜態文件命中率 > 90%
- [ ] 平均響應時間 < 100ms
- [ ] 零停機時間部署
- [ ] 自動錯誤恢復
- [ ] 完整的監控覆蓋

---

這個方案將為 Hero 和 Relic NFT 提供近乎即時的訪問速度，同時保持系統的可靠性和可維護性。