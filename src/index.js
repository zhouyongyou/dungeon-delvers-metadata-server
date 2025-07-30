// index.js (優化版 - 結合靜態 JSON 與 GraphQL 查詢)

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const NodeCache = require('node-cache');
const axios = require('axios');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const fs = require('fs');
const path = require('path');
const { getRarityFromMapping } = require('./rarityMapping');
const { getRarityFromContract } = require('./contractReader');
const configLoader = require('./configLoader');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// =================================================================
// Section: 配置與中間件
// =================================================================

// 安全中間件
app.use(helmet());
app.use(compression());

// CORS 配置 - 允許特定域名
const corsOptions = {
  origin: function (origin, callback) {
    // 允許的域名列表
    const allowedOrigins = [
      'https://dungeondelvers.xyz',
      'https://www.dungeondelvers.xyz',
      'https://dungeondelvers.vercel.app',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
    ];
    
    // 允許環境變數中的額外域名
    if (process.env.CORS_ORIGIN) {
      allowedOrigins.push(...process.env.CORS_ORIGIN.split(',').map(o => o.trim()));
    }
    
    // 允許無 origin 的請求（如 Postman）
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // 允許攜帶認證信息
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(morgan('combined'));

// 速率限制 - 分層限流策略
// 白名單 IP（無限制）
const whitelistedIPs = [
  '35.197.118.178', // Google Cloud IP
  // 可以在這裡添加更多白名單 IP
];

// 創建不同級別的限流器
const defaultRateLimiter = new RateLimiterMemory({
  keyGenerator: (req) => req.ip,
  points: 300, // 普通用戶：300 請求/分鐘（支援大量 NFT 持有者）
  duration: 60,
  blockDuration: 60, // 超限後封鎖 60 秒
});

// NFT 預緩存機制配置
const PREHEAT_CONFIG = {
  enabled: process.env.PREHEAT_ENABLED !== 'false', // 默認啟用
  interval: parseInt(process.env.PREHEAT_INTERVAL) || 3 * 60 * 1000, // 3 分鐘檢查一次
  quickInterval: 30 * 1000, // 快速檢查間隔：30 秒（檢測突發鑄造）
  lookbackMinutes: 60, // 檢查最近 60 分鐘的 NFT
  quickLookbackMinutes: 5, // 快速檢查最近 5 分鐘
  
  // 動態並發控制
  baseConcurrency: 20, // 基礎並發數
  maxConcurrency: 100, // 最大並發數
  batchSize: 50, // 每批處理數量
  batchDelay: 2000, // 批次間延遲 (毫秒)
  
  // 智能重試機制
  maxRetries: 3,
  retryDelay: 5000, // 重試延遲
  
  // 緩存策略 - ID 永不重用，可以放心長期緩存
  newNftCacheTTL: 90 * 24 * 60 * 60, // 新 NFT 緩存 90 天（更保守，防止意外）
  permanentCacheTTL: 365 * 24 * 60 * 60, // 確認存在的 NFT 緩存 1 年（ID 永不重用）
  cacheTTL: 30 * 24 * 60 * 60, // 預熱數據的默認緩存 30 天
  
  // 負載控制
  maxRpcCallsPerMinute: 200, // 每分鐘最多 RPC 調用數
  enableAdaptiveConcurrency: true, // 自適應並發控制
};

const serviceRateLimiter = new RateLimiterMemory({
  keyGenerator: (req) => req.ip,
  points: 1000, // 已知服務：1000 請求/分鐘
  duration: 60,
  blockDuration: 30, // 超限後封鎖 30 秒
});

// 針對 metadata 端點的特殊限流器（更寬鬆）
const metadataRateLimiter = new RateLimiterMemory({
  keyGenerator: (req) => req.ip,
  points: 600, // metadata 請求：600 請求/分鐘
  duration: 60,
  blockDuration: 30,
});

const rateLimiterMiddleware = async (req, res, next) => {
  // 白名單 IP 直接通過
  if (whitelistedIPs.includes(req.ip)) {
    return next();
  }
  
  // 檢查請求路徑
  const path = req.path.toLowerCase();
  const userAgent = req.headers['user-agent'] || '';
  
  // metadata 端點使用專門的限流器
  if (path.includes('/metadata/') || path.includes('/api/hero/') || 
      path.includes('/api/relic/') || path.includes('/api/party/')) {
    try {
      await metadataRateLimiter.consume(req.ip);
      return next();
    } catch (rejRes) {
      return res.status(429).json({ 
        error: 'Too many requests',
        message: 'Metadata rate limit exceeded (600 req/min)',
        retryAfter: Math.round(rejRes.msBeforeNext / 1000) || 60
      });
    }
  }
  
  // 為已知服務提供更高配額
  if (userAgent.includes('Go-http-client') || 
      userAgent.includes('PostmanRuntime') ||
      userAgent.includes('insomnia') ||
      userAgent.includes('axios')) {  // 添加 axios（常用於前端）
    try {
      await serviceRateLimiter.consume(req.ip);
      next();
    } catch (rejRes) {
      res.status(429).json({ 
        error: 'Too many requests',
        message: 'Service rate limit exceeded (1000 req/min)',
        retryAfter: Math.round(rejRes.msBeforeNext / 1000) || 30
      });
    }
  } else {
    // 普通用戶使用默認限制
    try {
      await defaultRateLimiter.consume(req.ip);
      next();
    } catch (rejRes) {
      res.status(429).json({ 
        error: 'Too many requests',
        message: 'Rate limit exceeded (300 req/min)',
        retryAfter: Math.round(rejRes.msBeforeNext / 1000) || 60
      });
    }
  }
};

app.use(rateLimiterMiddleware);

// 快取配置
const cache = new NodeCache({ 
  stdTTL: 60, // 1分鐘（減少快取時間以提供更及時的更新）
  checkperiod: 30, // 30秒檢查一次
  maxKeys: 1000 // 最大快取項目
});

// 熱門 NFT 快取
const hotNftCache = new NodeCache({ 
  stdTTL: 300, // 5分鐘（減少快取時間）
  checkperiod: 60, // 1分鐘檢查一次
  maxKeys: 100 // 最大快取項目
});

// =================================================================
// Section: 配置常量
// =================================================================

// The Graph URL - 支援去中心化優先策略
let THE_GRAPH_API_URL = process.env.THE_GRAPH_API_URL || 
                       process.env.THE_GRAPH_DECENTRALIZED_URL || 
                       'https://gateway.thegraph.com/api/f6c1aba78203cfdf0cc732eafe677bdd/subgraphs/id/Hmwr7XYgzVzsUb9dw95gSGJ1Vof6qYypuvCxynzinCjs';

// Studio 版本作為備用
const THE_GRAPH_STUDIO_URL = process.env.THE_GRAPH_STUDIO_URL || 
                            'https://api.studio.thegraph.com/query/115633/dungeon-delvers/v3.2.0';

global.THE_GRAPH_API_URL = THE_GRAPH_API_URL;
global.THE_GRAPH_STUDIO_URL = THE_GRAPH_STUDIO_URL;
const SUBGRAPH_ID = process.env.SUBGRAPH_ID || 'dungeon-delvers';

// JSON 文件路徑配置 - 指向主專案的 public/api
const JSON_BASE_PATH = path.join(__dirname, '../../../GitHub/DungeonDelvers/public/api');

// 前端域名配置 - 用於圖片 URL
const FRONTEND_DOMAIN = process.env.FRONTEND_DOMAIN || 'https://dungeondelvers.xyz';

// 測試模式：根據 tokenId 模擬稀有度（僅用於測試）
const TEST_MODE = process.env.TEST_MODE === 'true';

// 合約地址配置 - 初始化時從環境變數載入作為備份
let CONTRACTS = {
  hero: process.env.HERO_ADDRESS,
  relic: process.env.RELIC_ADDRESS,
  party: process.env.PARTY_ADDRESS,
  vip: process.env.VIPSTAKING_ADDRESS,
  playerprofile: process.env.PLAYERPROFILE_ADDRESS
};

// 異步初始化函數
async function initializeConfig() {
  try {
    console.log('🔄 載入配置...');
    const config = await configLoader.loadConfig();
    
    // 更新合約地址
    CONTRACTS = {
      hero: config.contracts.HERO_ADDRESS || CONTRACTS.hero,
      relic: config.contracts.RELIC_ADDRESS || CONTRACTS.relic,
      party: config.contracts.PARTY_ADDRESS || CONTRACTS.party,
      vip: config.contracts.VIPSTAKING_ADDRESS || CONTRACTS.vip,
      playerprofile: config.contracts.PLAYERPROFILE_ADDRESS || CONTRACTS.playerprofile
    };
    
    console.log(`✅ 配置載入成功: Version ${config.version}`);
    console.log('📋 合約地址:', CONTRACTS);
    
    // 更新 The Graph URL 如果有的話
    if (config.subgraph?.url) {
      global.THE_GRAPH_API_URL = config.subgraph.url;
    }
  } catch (error) {
    console.error('❌ 配置載入失敗，使用環境變數:', error.message);
  }
  
  // 驗證必要的合約地址
  const requiredContracts = ['hero', 'relic', 'party', 'vip', 'playerprofile'];
  for (const contract of requiredContracts) {
    if (!CONTRACTS[contract]) {
      console.error(`ERROR: ${contract.toUpperCase()}_ADDRESS not set`);
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      }
    }
  }
}

// 添加NFT市場API配置（BSC鏈優先）
const NFT_MARKET_APIS = {
  // BSC鏈主要市場
  okx: 'https://www.okx.com/api/v5/nft',
  element: 'https://api.element.market',
  // 其他市場
  opensea: 'https://api.opensea.io/api/v2',
  blur: 'https://api.blur.io',
  // 可以添加更多市場API
};

// =================================================================
// Section: GraphQL 查詢
// =================================================================

const GRAPHQL_QUERIES = {
  // 查詢特定 NFT
  getNftById: `
    query GetNftById($nftId: String!) {
      hero(id: $nftId) {
        id tokenId owner { id } power rarity createdAt
      }
      relic(id: $nftId) {
        id tokenId owner { id } capacity rarity createdAt
      }
      party(id: $nftId) {
        id tokenId owner { id } totalPower totalCapacity partyRarity createdAt
      }
    }
  `,
  
  // 查詢玩家資產
  getPlayerAssets: `
    query GetPlayerAssets($owner: String!, $first: Int = 100, $skip: Int = 0) {
      player(id: $owner) {
        id
        heros(first: $first, skip: $skip, orderBy: createdAt, orderDirection: desc) {
          id tokenId power rarity createdAt
        }
        relics(first: $first, skip: $skip, orderBy: createdAt, orderDirection: desc) {
          id tokenId capacity rarity createdAt
        }
        parties(first: $first, skip: $skip, orderBy: createdAt, orderDirection: desc) {
          id tokenId totalPower totalCapacity partyRarity createdAt
        }
      }
    }
  `,
  
  // 查詢統計數據
  getStats: `
    query GetStats {
      globalStats(id: "global") {
        totalHeroes totalRelics totalParties totalPlayers
        totalUpgradeAttempts successfulUpgrades
        lastUpdated
      }
    }
  `,
  
  // 查詢同步狀態
  getSyncStatus: `
    query GetSyncStatus {
      _meta {
        hasIndexingErrors
        block {
          number
        }
      }
    }
  `,
  
  // 查詢NFT稀有度
  getNftRarity: `
    query GetNftRarity($nftId: String!) {
      hero(id: $nftId) {
        rarity
      }
      relic(id: $nftId) {
        rarity
      }
      party(id: $nftId) {
        partyRarity
      }
    }
  `
};

// =================================================================
// Section: 工具函數
// =================================================================

// GraphQL 請求函數
async function queryGraphQL(query, variables = {}) {
  const requestConfig = {
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'DungeonDelvers-MetadataServer/1.3.0'
    }
  };

  // 首先嘗試去中心化版本
  try {
    console.log(`[The Graph] 使用去中心化版本查詢...`);
    const response = await axios.post(global.THE_GRAPH_API_URL || THE_GRAPH_API_URL, {
      query,
      variables
    }, requestConfig);

    if (response.data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
    }

    console.log(`[The Graph] ✅ 去中心化版本查詢成功`);
    return response.data.data;
    
  } catch (primaryError) {
    console.error(`[The Graph] ❌ 去中心化版本失敗:`, primaryError.message);
    
    // 備用：嘗試 Studio 版本
    try {
      console.log(`[The Graph] 嘗試 Studio 備用版本...`);
      const fallbackResponse = await axios.post(global.THE_GRAPH_STUDIO_URL || THE_GRAPH_STUDIO_URL, {
        query,
        variables
      }, requestConfig);

      if (fallbackResponse.data.errors) {
        throw new Error(`Studio GraphQL errors: ${JSON.stringify(fallbackResponse.data.errors)}`);
      }

      console.log(`[The Graph] ✅ Studio 備用版本查詢成功`);
      return fallbackResponse.data.data;
      
    } catch (fallbackError) {
      console.error(`[The Graph] ❌ Studio 備用版本也失敗:`, fallbackError.message);
      throw new Error(`所有 GraphQL 端點都失敗 - 主要: ${primaryError.message}, 備用: ${fallbackError.message}`);
    }
  }
}

// 測試模式：根據 tokenId 模擬稀有度
function getTestRarity(tokenId) {
  if (!TEST_MODE) return null;
  // 根據 tokenId 模擬稀有度：1-20=1星, 21-40=2星, 41-60=3星, 61-80=4星, 81-100=5星
  const num = parseInt(tokenId);
  if (num <= 20) return 1;
  if (num <= 40) return 2;
  if (num <= 60) return 3;
  if (num <= 80) return 4;
  return 5;
}

// 智能推斷稀有度：使用更精確的映射表
function inferRarity(type, tokenId) {
  // 首先嘗試使用精確映射
  try {
    return getRarityFromMapping(type, tokenId);
  } catch (error) {
    console.warn(`使用映射表失敗，回退到簡單算法: ${error.message}`);
    
    // 備用的簡單算法
    const id = parseInt(tokenId);
    const hash = id * 2654435761 % 2147483647;
    const random = (hash % 100) + 1;
    
    // 默認分布
    if (random <= 30) return 1;
    if (random <= 65) return 2;
    if (random <= 90) return 3;
    if (random <= 98) return 4;
    return 5;
  }
}

// 讀取 JSON 文件的工具函數
function readJSONFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading JSON file ${filePath}:`, error);
    return null;
  }
}

// 標準化 metadata（原 OKX 適配器功能）
function standardizeMetadata(metadata, type, tokenId) {
  // Ensure attributes exist
  if (!metadata.attributes) {
    metadata.attributes = [];
  }

  // Process each attribute
  metadata.attributes = metadata.attributes.map(attr => {
    const adapted = { ...attr };

    // Handle Rarity - MUST be numeric
    if (attr.trait_type === 'Rarity') {
      // 如果稀有度為 null 或 undefined，不包含此屬性
      if (attr.value === null || attr.value === undefined || attr.value === 'Unknown') {
        return null; // 將在後面過濾掉
      }
      adapted.value = normalizeRarity(attr.value);
      adapted.display_type = 'number';
      adapted.max_value = 5;
    }
    
    // Handle other numeric attributes
    else if (isNumericAttribute(attr.trait_type)) {
      adapted.value = ensureNumeric(attr.value, 0);
      adapted.display_type = 'number';
      
      // Add specific max values for known attributes
      if (attr.trait_type === 'Power' || attr.trait_type === 'Capacity') {
        adapted.max_value = 9999;
      }
    }
    
    // Keep string attributes as-is
    return adapted;
  }).filter(attr => attr !== null); // 過濾掉 null 值

  // Ensure Token ID is present and numeric
  const hasTokenId = metadata.attributes.some(attr => attr.trait_type === 'Token ID');
  if (!hasTokenId && tokenId) {
    metadata.attributes.push({
      trait_type: 'Token ID',
      value: parseInt(tokenId),
      display_type: 'number'
    });
  }

  // 如果沒有稀有度，添加狀態說明
  const hasRarity = metadata.attributes.some(attr => attr.trait_type === 'Rarity');
  if (!hasRarity) {
    metadata.attributes.push({
      trait_type: 'Status',
      value: 'Data Syncing',
      display_type: 'string'
    });
    
    // 添加 BSC 鏈標識
    metadata.attributes.push({
      trait_type: 'Chain',
      value: 'BSC',
      display_type: 'string'
    });
  }
  
  // Ensure HTTPS image URL
  metadata.image = ensureHttpsUrl(metadata.image);
  
  // Add external_url for NFT detail page navigation
  if (!metadata.external_url) {
    metadata.external_url = `${FRONTEND_DOMAIN}/nft/${type}/${tokenId}`;
  }

  // Add animation_url if applicable
  if (metadata.animation_url) {
    metadata.animation_url = ensureHttpsUrl(metadata.animation_url);
  }

  // Market compatibility metadata
  metadata.okx_optimized = true;
  metadata.marketplace_compatibility = 'unified';
  metadata.charset = 'UTF-8';

  // Add collection info if missing
  if (!metadata.collection) {
    metadata.collection = {
      name: 'Dungeon Delvers',
      family: 'Dungeon Delvers NFT'
    };
  }

  return metadata;
}

// Helper functions
function normalizeRarity(rarity) {
  if (typeof rarity === 'number') return Math.max(1, Math.min(5, rarity));
  
  const rarityMap = {
    'common': 1,
    'uncommon': 2,
    'rare': 2,
    'epic': 3,
    'legendary': 4,
    'mythic': 5,
    'mythical': 5
  };
  
  const normalized = rarityMap[String(rarity).toLowerCase()];
  return normalized || 1;
}

function isNumericAttribute(traitType) {
  const numericTraits = [
    'Power', 'Capacity', 'Total Power', 'Total Capacity',
    'Token ID', 'Heroes Count', 'Level', 'Experience'
  ];
  return numericTraits.includes(traitType);
}

function ensureNumeric(value, defaultValue = 0) {
  const num = parseInt(value);
  return !isNaN(num) ? num : defaultValue;
}

function ensureHttpsUrl(url, baseUrl = FRONTEND_DOMAIN) {
  if (!url) return '';
  
  if (url.startsWith('https://')) return url;
  if (url.startsWith('http://')) return url.replace('http://', 'https://');
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return baseUrl + url;
  
  return url;
}

// 生成標準 NFT 名稱（英文格式）
function generateEnhancedNFTName(type, tokenId, rarity) {
  const validRarity = Math.max(1, Math.min(5, rarity || 1));
  
  const rarityNames = {
    1: 'Common',
    2: 'Rare', 
    3: 'Epic',
    4: 'Legendary',
    5: 'Mythic'
  };
  
  const typeNames = {
    'hero': 'Hero',
    'relic': 'Relic', 
    'party': 'Party',
    'vip': 'VIP Pass',
    'vipstaking': 'VIP Pass',
    'playerprofile': 'Player Profile'
  };
  
  const rarityText = rarityNames[validRarity] || 'Common';
  const typeText = typeNames[type] || type.charAt(0).toUpperCase() + type.slice(1);
  
  // 對於 VIP 和 Profile，不使用稀有度前綴
  if (type === 'vip' || type === 'vipstaking' || type === 'playerprofile') {
    return `${typeText} #${tokenId}`;
  }
  
  return `${rarityText} ${typeText} #${tokenId}`;
}

// 生成 fallback metadata (占位符)
async function generateFallbackMetadata(type, tokenId, rarity = null) {
  // 不再進行任何稀有度計算，直接返回占位符
  console.log(`Generating placeholder for ${type} #${tokenId}`);
  
  const baseData = {
    name: `${type.charAt(0).toUpperCase() + type.slice(1)} #${tokenId}`,
    description: "This NFT's data is currently unavailable. Please try again later.",
    image: `${FRONTEND_DOMAIN}/images/${type}/${type}-placeholder.png`,
    attributes: [
      { trait_type: "Status", value: "Loading" },
      { trait_type: "Token ID", value: parseInt(tokenId) }
    ],
    source: 'placeholder'
  };
  
  // 直接返回基礎占位符數據
  return baseData;
}

// OKX Compatibility Layer (Deprecated - now using MarketplaceAdapter)
// Kept for backward compatibility but replaced by adapter pattern
function ensureOKXCompatibility(metadata, type, tokenId) {
  // Create a deep copy to avoid modifying the original
  const fixed = JSON.parse(JSON.stringify(metadata));
  
  // Ensure Rarity is numeric
  if (fixed.attributes && Array.isArray(fixed.attributes)) {
    fixed.attributes = fixed.attributes.map(attr => {
      if (attr.trait_type === 'Rarity' && typeof attr.value !== 'number') {
        // Convert string rarity to number
        const numValue = parseInt(attr.value);
        return {
          ...attr,
          value: !isNaN(numValue) && numValue >= 1 && numValue <= 5 ? numValue : 1
        };
      }
      // Ensure other numeric fields are numbers
      if (['Power', 'Capacity', 'Total Power', 'Total Capacity', 'Token ID', 'Heroes Count'].includes(attr.trait_type)) {
        const numValue = parseInt(attr.value);
        return {
          ...attr,
          value: !isNaN(numValue) ? numValue : 0
        };
      }
      return attr;
    });
  }
  
  // Ensure image URL is absolute HTTPS
  if (fixed.image && !fixed.image.startsWith('https://')) {
    if (fixed.image.startsWith('http://')) {
      fixed.image = fixed.image.replace('http://', 'https://');
    } else if (fixed.image.startsWith('/')) {
      fixed.image = `${FRONTEND_DOMAIN}${fixed.image}`;
    }
  }
  
  // Add external_url if missing
  if (!fixed.external_url) {
    fixed.external_url = `${FRONTEND_DOMAIN}/nft/${type}/${tokenId}`;
  }
  
  return fixed;
}

// 快取鍵生成
function generateCacheKey(type, params) {
  return `${type}:${JSON.stringify(params)}`;
}

// 從OKX NFT市場獲取資料
async function fetchFromOKX(type, tokenId, contractAddress) {
  try {
    const url = `${NFT_MARKET_APIS.okx}/collection/${contractAddress}/token/${tokenId}`;
    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'DungeonDelvers-MetadataServer/1.3.0',
        'Accept': 'application/json'
      }
    });
    
    if (response.data?.data?.[0]) {
      const nft = response.data.data[0];
      return {
        name: nft.name || `${type.charAt(0).toUpperCase() + type.slice(1)} #${tokenId}`,
        description: nft.description || 'Dungeon Delvers NFT',
        image: nft.image_url || nft.image || `${FRONTEND_DOMAIN}/images/${type}/${type}-1.png`,
        attributes: nft.attributes || [],
        source: 'okx',
        lastUpdated: new Date().toISOString()
      };
    }
  } catch (error) {
    console.warn(`無法從OKX獲取 ${type} #${tokenId}: ${error.message}`);
  }
  
  return null;
}

// 從Element市場獲取資料
async function fetchFromElement(type, tokenId, contractAddress) {
  try {
    const url = `${NFT_MARKET_APIS.element}/api/v1/nft/${contractAddress}/${tokenId}`;
    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'DungeonDelvers-MetadataServer/1.3.0',
        'Accept': 'application/json'
      }
    });
    
    const nft = response.data?.nft || response.data?.data;
    if (nft) {
      return {
        name: nft.name || `${type.charAt(0).toUpperCase() + type.slice(1)} #${tokenId}`,
        description: nft.description || 'Dungeon Delvers NFT',
        image: nft.image_url || nft.image || `${FRONTEND_DOMAIN}/images/${type}/${type}-1.png`,
        attributes: nft.attributes || [],
        source: 'element',
        lastUpdated: new Date().toISOString()
      };
    }
  } catch (error) {
    console.warn(`無法從Element獲取 ${type} #${tokenId}: ${error.message}`);
  }
  
  return null;
}

// 從OpenSea獲取資料
async function fetchFromOpenSea(type, tokenId, contractAddress) {
  try {
    const openseaUrl = `${NFT_MARKET_APIS.opensea}/chain/base/contract/${contractAddress}/nfts/${tokenId}`;
    const response = await axios.get(openseaUrl, {
      timeout: 5000,
      headers: {
        'User-Agent': 'DungeonDelvers-MetadataServer/1.3.0'
      }
    });
    
    if (response.data?.nft) {
      const nft = response.data.nft;
      return {
        name: nft.name || `${type.charAt(0).toUpperCase() + type.slice(1)} #${tokenId}`,
        description: nft.description || 'Dungeon Delvers NFT',
        image: nft.image_url || `${FRONTEND_DOMAIN}/images/${type}/${type}-1.png`,
        attributes: nft.traits || [],
        source: 'opensea',
        lastUpdated: new Date().toISOString()
      };
    }
  } catch (error) {
    console.warn(`無法從OpenSea獲取 ${type} #${tokenId}: ${error.message}`);
  }
  
  return null;
}

// 從NFT市場獲取最新資料（只有 OKX 支援 BSC）
async function fetchFromNFTMarket(type, tokenId, contractAddress) {
  // 檢查是否啟用市場獲取
  if (process.env.ENABLE_MARKET_FETCH !== 'true') {
    return null;
  }
  
  // 只使用 OKX，因為是 BSC 上唯一的 NFT 市場
  const marketSources = [
    { name: 'okx', fetchFn: () => fetchFromOKX(type, tokenId, contractAddress) },
    // Element 和 OpenSea 已不再支援 BSC
    // { name: 'element', fetchFn: () => fetchFromElement(type, tokenId, contractAddress) },
    // { name: 'opensea', fetchFn: () => fetchFromOpenSea(type, tokenId, contractAddress) },
  ];

  for (const source of marketSources) {
    try {
      const data = await source.fetchFn();
      if (data) {
        console.log(`✅ 從 ${source.name} 獲取到 ${type} #${tokenId} 資料`);
        return data;
      }
    } catch (error) {
      console.warn(`❌ 從 ${source.name} 獲取 ${type} #${tokenId} 失敗: ${error.message}`);
      continue;
    }
  }
  
  return null;
}

// 檢查是否需要從市場更新資料
function shouldUpdateFromMarket(lastUpdate, cacheAge) {
  const now = Date.now();
  const lastUpdateTime = new Date(lastUpdate).getTime();
  const cacheAgeMs = cacheAge * 1000;
  
  // 如果快取超過5分鐘或最後更新超過10分鐘，嘗試從市場更新
  return (now - lastUpdateTime) > 600000 || cacheAge > 300;
}

// 開發環境下提供靜態文件服務（可選）
if (process.env.NODE_ENV === 'development') {
  console.log('🔧 Development mode: Serving static files locally');
  app.use('/images', express.static(path.join(__dirname, '../../public/images')));
  app.use('/assets', express.static(path.join(__dirname, '../../public/assets')));
}

// =================================================================
// Section: API 路由
// =================================================================

// 健康檢查
app.get('/health', async (req, res) => {
  // 嘗試重新載入配置
  const currentConfig = await configLoader.loadConfig();
  
  res.json({
    status: 'healthy',
    version: '1.3.0',
    configVersion: currentConfig.version,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cache: {
      size: cache.keys().length,
      hotNftSize: hotNftCache.keys().length,
      cacheTTL: '60s',
      hotCacheTTL: '300s'
    },
    features: {
      bscMarketIntegration: true,
      graphqlSync: true,
      autoRefresh: true,
      marketPriority: ['okx', 'element', 'opensea'],
      dynamicConfig: true
    },
    contracts: CONTRACTS,
    configSource: currentConfig.version ? 'remote' : 'env'
  });
});

// =================================================================
// Section: RPC 代理服務 (已棄用 - 前端現在使用 Vercel API 路由)
// =================================================================

// 註釋掉 RPC 代理相關代碼，因為前端已經使用 Vercel 的 /api/rpc
/*
// Alchemy API Keys 池 - 從環境變數讀取
const ALCHEMY_API_KEYS = [
  process.env.ALCHEMY_API_KEY_1,
  process.env.ALCHEMY_API_KEY_2,
  process.env.ALCHEMY_API_KEY_3,
  process.env.ALCHEMY_API_KEY_4,
  process.env.ALCHEMY_API_KEY_5,
  // 向後兼容舊的環境變數名稱
  process.env.ALCHEMY_BSC_MAINNET_RPC_URL?.replace('https://bnb-mainnet.g.alchemy.com/v2/', ''),
].filter(Boolean); // 移除 null/undefined 值

// 確保至少有一個 API Key
if (ALCHEMY_API_KEYS.length === 0) {
  console.error('❌ 錯誤：未配置 Alchemy API Keys！');
  console.error('請在環境變數中設置 ALCHEMY_API_KEY_1, ALCHEMY_API_KEY_2 等');
}

// API Key 輪替索引
let currentApiKeyIndex = 0;

// 獲取下一個 API Key
function getNextAlchemyUrl() {
  const apiKey = ALCHEMY_API_KEYS[currentApiKeyIndex];
  currentApiKeyIndex = (currentApiKeyIndex + 1) % ALCHEMY_API_KEYS.length;
  return `https://bnb-mainnet.g.alchemy.com/v2/${apiKey}`;
}

// BSC RPC 節點池 - 只使用 Alchemy 私人節點
const BSC_RPC_NODES = [
  // 所有 Alchemy 節點（輪替使用）
  ...ALCHEMY_API_KEYS.map(key => `https://bnb-mainnet.g.alchemy.com/v2/${key}`),
  // 環境變數中的額外私人節點
  process.env.ALCHEMY_BSC_MAINNET_RPC_URL,
  process.env.BSC_MAINNET_RPC_URL,
].filter(url => url && url.includes('alchemy.com')); // 只保留 Alchemy 節點

// 驗證是否有可用的私人節點
if (BSC_RPC_NODES.length === 0) {
  console.error('❌ 致命錯誤：沒有配置任何 Alchemy RPC 節點！');
  console.error('請設置以下環境變數：');
  console.error('- ALCHEMY_API_KEY_1');
  console.error('- ALCHEMY_API_KEY_2');
  console.error('- ALCHEMY_API_KEY_3');
  console.error('- ALCHEMY_API_KEY_4');
  console.error('或者：');
  console.error('- ALCHEMY_BSC_MAINNET_RPC_URL');
  process.exit(1); // 無私人節點時直接退出
}

console.log(`✅ 已配置 ${BSC_RPC_NODES.length} 個 Alchemy 私人節點`);
*/

// RPC 節點健康狀態 - 已棄用，現在使用輪替機制
// const rpcHealthStatus = new Map();

// 初始化 RPC 健康狀態 - 已棄用
// BSC_RPC_NODES.forEach(node => {
//   rpcHealthStatus.set(node, { healthy: true, lastCheck: Date.now(), latency: 0 });
// });

// RPC 健康檢查 - 已棄用，不再需要
// async function checkRpcHealth(rpcUrl) {
//   const start = Date.now();
//   try {
//     const response = await axios.post(rpcUrl, {
//       jsonrpc: '2.0',
//       method: 'eth_blockNumber',
//       params: [],
//       id: 1,
//     }, { timeout: 5000 });
//     
//     const latency = Date.now() - start;
//     const healthy = response.data && response.data.result;
//     
//     rpcHealthStatus.set(rpcUrl, {
//       healthy: !!healthy,
//       lastCheck: Date.now(),
//       latency,
//       blockNumber: healthy ? parseInt(response.data.result, 16) : null
//     });
//     
//     return { healthy: !!healthy, latency };
//   } catch (error) {
//     rpcHealthStatus.set(rpcUrl, {
//       healthy: false,
//       lastCheck: Date.now(),
//       latency: Date.now() - start,
//       error: error.message
//     });
//     return { healthy: false, latency: Date.now() - start };
//   }
// }

// 註釋掉 RPC 代理相關功能，因為前端已經使用 Vercel 的 /api/rpc
/*
// 獲取最佳 RPC 節點 - 簡化版本，只使用輪替的 Alchemy 節點
function getBestRpcNode() {
  // 直接使用輪替的 Alchemy URL
  const alchemyUrl = getNextAlchemyUrl();
  console.log(`🎯 使用輪替 Alchemy 節點 #${currentApiKeyIndex}`); // 不再顯示完整 URL 以保護 API key
  return alchemyUrl;
}

// 定期健康檢查（每5分鐘）- 已註釋，因為現在完全使用 RPC 代理
// setInterval(async () => {
//   console.log('🔍 執行 RPC 節點健康檢查...');
//   const promises = BSC_RPC_NODES.map(checkRpcHealth);
//   await Promise.all(promises);
//   
//   const healthyCount = Array.from(rpcHealthStatus.values()).filter(s => s.healthy).length;
//   console.log(`✅ RPC 健康檢查完成: ${healthyCount}/${BSC_RPC_NODES.length} 節點健康`);
// }, 5 * 60 * 1000);

// RPC 代理端點
app.post('/api/rpc', async (req, res) => {
  try {
    const rpcRequest = req.body;
    
    // 驗證請求格式
    if (!rpcRequest || !rpcRequest.method) {
      return res.status(400).json({
        error: 'Invalid RPC request format'
      });
    }
    
    // 獲取最佳節點
    const bestNode = getBestRpcNode();
    
    // 轉發請求
    const response = await axios.post(bestNode, rpcRequest, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    // 記錄成功請求
    console.log(`📡 RPC 請求成功: ${rpcRequest.method} via ${bestNode}`);
    
    res.json(response.data);
    
  } catch (error) {
    console.error(`❌ RPC 請求失敗: ${error.message}`);
    
    // 記錄錯誤但不再標記節點狀態，因為我們使用輪替機制
    console.error(`❌ 當前節點請求失敗，下次將自動切換到另一個節點`);
    
    res.status(500).json({
      error: 'RPC request failed',
      message: error.message
    });
  }
});

// RPC 節點狀態查詢 - 簡化版本
app.get('/api/rpc/status', (req, res) => {
  res.json({
    summary: {
      total: ALCHEMY_API_KEYS.length,
      mode: 'round-robin',
      currentIndex: currentApiKeyIndex,
      message: '使用 Alchemy API Keys 輪替機制'
    },
    nodes: ALCHEMY_API_KEYS.map((_, index) => ({
      index,
      status: 'active',
      type: 'alchemy-private'
    })),
    proxyEnabled: true,
    healthCheckDisabled: true,
    note: '已移除公共節點健康檢查，完全使用 RPC 代理'
  });
});
*/

// 同步狀態 API
app.get('/api/sync-status', async (req, res) => {
  try {
    const cacheKey = 'sync-status';
    let syncStatus = cache.get(cacheKey);
    
    if (!syncStatus) {
      const data = await queryGraphQL(GRAPHQL_QUERIES.getSyncStatus);
      syncStatus = {
        hasIndexingErrors: data._meta?.hasIndexingErrors || false,
        currentBlock: data._meta?.block?.number || 0,
        lastChecked: new Date().toISOString(),
        status: data._meta?.hasIndexingErrors ? 'error' : 'synced'
      };
      
      // 快取 30 秒
      cache.set(cacheKey, syncStatus, 30);
    }
    
    res.json(syncStatus);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get sync status',
      message: error.message,
      status: 'error'
    });
  }
});

// 獲取特定 NFT（優化版）
app.get('/api/:type/:tokenId', async (req, res) => {
  try {
    const { type, tokenId } = req.params;
    const { owner, rarity } = req.query;
    
    if (!['hero', 'relic', 'party', 'vip', 'vipstaking', 'playerprofile'].includes(type)) {
      return res.status(400).json({ error: 'Invalid NFT type' });
    }
    
    const cacheKey = generateCacheKey(`${type}-${tokenId}`, { owner, rarity });
    let nftData = cache.get(cacheKey);
    
    if (!nftData) {
      try {
        // 先嘗試從 subgraph 獲取資料
        if (['hero', 'relic', 'party'].includes(type)) {
          const contractAddress = CONTRACTS[type];
          const nftId = `${contractAddress.toLowerCase()}-${tokenId}`;
          const data = await queryGraphQL(GRAPHQL_QUERIES.getNftById, {
            nftId
          });
          
          const nft = data[type];
          if (nft) {
            // 將子圖資料轉換為標準 NFT metadata 格式
            const rarity = nft.rarity || nft.partyRarity || 1;
            const rarityIndex = Math.max(1, Math.min(5, rarity));
            
            nftData = {
              name: generateEnhancedNFTName(type, tokenId, rarity),
              description: 'Dungeon Delvers NFT - 從區塊鏈獲取的即時資料',
              image: `${FRONTEND_DOMAIN}/images/${type}/${type}-${rarityIndex}.png`,
              attributes: [
                { trait_type: 'Token ID', value: parseInt(tokenId) },
                { trait_type: 'Rarity', value: rarity },
                ...(type === 'hero' ? [
                  { trait_type: 'Power', value: parseInt(nft.power) }
                ] : type === 'relic' ? [
                  { trait_type: 'Capacity', value: parseInt(nft.capacity) }
                ] : type === 'party' ? [
                  { trait_type: 'Total Power', value: parseInt(nft.totalPower) },
                  { trait_type: 'Total Capacity', value: parseInt(nft.totalCapacity) }
                ] : [])
              ],
              source: 'subgraph',
              contractAddress,
              type,
              // 保留原始子圖資料供內部使用
              _subgraphData: nft
            };
          }
        }
        
        // 如果 subgraph 沒有資料，嘗試從合約確認 NFT 是否存在
        if (!nftData) {
          console.log(`No subgraph data for ${type} #${tokenId}, checking contract...`);
          
          // 先嘗試從合約確認 NFT 是否存在
          let nftExists = false;
          let contractRarity = null;
          
          try {
            contractRarity = await getRarityFromContract(type, tokenId);
            if (contractRarity) {
              nftExists = true;
              console.log(`${type} #${tokenId} exists in contract with rarity ${contractRarity}`);
            }
          } catch (error) {
            console.log(`Contract check failed: ${error.message}`);
          }
          
          if (nftExists && contractRarity) {
            // NFT 存在但子圖還沒索引，使用合約數據生成臨時元數據
            const rarityIndex = Math.max(1, Math.min(5, contractRarity));
            const jsonPath = path.join(JSON_BASE_PATH, type, `${rarityIndex}.json`);
            const templateData = readJSONFile(jsonPath);
            
            if (templateData) {
              nftData = {
                ...templateData,
                name: `${type.charAt(0).toUpperCase() + type.slice(1)} #${tokenId}`,
                tokenId: tokenId.toString(),
                attributes: [
                  ...templateData.attributes,
                  { trait_type: "Data Source", value: "Contract (Indexing)" }
                ],
                // 添加標記表示這是臨時數據
                indexing: true
              };
              console.log(`Using contract data for ${type} #${tokenId} while indexing`);
            }
          }
          
          // 如果還是沒有數據，返回占位符
          if (!nftData) {
            console.log(`No data found for ${type} #${tokenId}, returning placeholder`);
            
            // 嘗試讀取占位符文件
            const placeholderPath = path.join(JSON_BASE_PATH, type, 'placeholder.json');
            const placeholderData = readJSONFile(placeholderPath);
            
            if (placeholderData) {
              // 使用占位符數據 - 保持原始內容不變
              nftData = {
                ...placeholderData,
                tokenId: tokenId.toString(),
                // 只添加必要的額外屬性
                attributes: [
                  ...placeholderData.attributes,
                  { trait_type: "Token ID", value: parseInt(tokenId), display_type: "number" }
                ]
              };
            } else {
              // 連占位符都沒有，使用最基本的 fallback
              nftData = {
                name: `${type.charAt(0).toUpperCase() + type.slice(1)} #${tokenId}`,
                description: "This NFT's data is currently unavailable. Please try again later.",
                image: `${FRONTEND_DOMAIN}/images/${type}/${type}-placeholder.png`,
                attributes: [
                  { trait_type: "Status", value: "Loading" },
                  { trait_type: "Token ID", value: parseInt(tokenId) }
                ],
                tokenId: tokenId.toString()
              };
            }
          }
        }
        
        // 動態快取策略
        if (nftData) {
          if (nftData.indexing) {
            // 正在索引的 NFT 只快取 10 秒，以便快速更新
            cache.set(cacheKey, nftData, 10);
            console.log(`Caching indexing NFT ${type} #${tokenId} for 10 seconds`);
          } else if (nftData.source === 'placeholder') {
            // 占位符快取 5 秒
            cache.set(cacheKey, nftData, 5);
            console.log(`Caching placeholder ${type} #${tokenId} for 5 seconds`);
          } else {
            // 正常數據快取 1 分鐘
            cache.set(cacheKey, nftData, 60);
          }
        }
        
        // 直接跳到 marketplace adapter
        if (false) { // 保留這段以避免大幅修改
          let rarity = 1;
          
          // 測試模式：根據 tokenId 模擬稀有度
          const testRarity = getTestRarity(tokenId);
          if (testRarity !== null) {
            rarity = testRarity;
            console.log(`🧪 測試模式: ${type} #${tokenId} 模擬稀有度: ${rarity}`);
          } else {
            // 嘗試從 subgraph 獲取稀有度
            try {
              const contractAddress = CONTRACTS[type];
              const nftId = `${contractAddress.toLowerCase()}-${tokenId}`;
              
              const data = await queryGraphQL(GRAPHQL_QUERIES.getNftRarity, { nftId });
              
              if (data?.[type]?.rarity || data?.[type]?.partyRarity) {
                rarity = parseInt(data[type].rarity || data[type].partyRarity);
                console.log(`${type} #${tokenId} 稀有度: ${rarity}`);
              } else {
                // 子圖查詢成功但沒有資料，嘗試從合約讀取
                console.warn(`子圖中沒有 ${type} #${tokenId} 的資料，嘗試從合約讀取`);
                try {
                  rarity = await getRarityFromContract(type, tokenId);
                  if (rarity) {
                    console.log(`從合約獲取 ${type} #${tokenId} 稀有度: ${rarity}`);
                  } else {
                    // 合約也沒有資料，可能 NFT 不存在
                    console.warn(`${type} #${tokenId} 在合約中不存在，不設置稀有度`);
                    rarity = null; // 不使用假的隨機值
                  }
                } catch (contractError) {
                  console.error(`合約讀取失敗: ${contractError.message}`);
                  // 最後備選：不設置稀有度
                  rarity = null;
                }
              }
            } catch (error) {
              console.warn(`無法從子圖獲取 ${type} 稀有度: ${error.message}`);
              // 嘗試從合約讀取
              try {
                rarity = await getRarityFromContract(type, tokenId);
                if (rarity) {
                  console.log(`從合約獲取 ${type} #${tokenId} 稀有度: ${rarity}`);
                } else {
                  console.warn(`${type} #${tokenId} 在合約中不存在，不設置稀有度`);
                  rarity = null;
                }
              } catch (contractError) {
                console.error(`合約讀取也失敗: ${contractError.message}`);
                // 最後備選：不設置稀有度
                rarity = null;
              }
            }
          }
          
          // 根據稀有度選擇圖片 (1-5)
          if (rarity === null || rarity === undefined) {
            console.log(`${type} #${tokenId} 沒有稀有度資料，使用占位符`);
            nftData = await generateFallbackMetadata(type, tokenId, null);
            nftData = {
              ...nftData,
              id: tokenId,
              contractAddress: CONTRACTS[type],
              type
            };
          } else {
            const rarityIndex = Math.max(1, Math.min(5, rarity));
            const jsonPath = path.join(JSON_BASE_PATH, type, `${rarityIndex}.json`);
            
            let metadata = readJSONFile(jsonPath);
          
          if (!metadata) {
            console.warn(`${type} JSON not found for rarity ${rarityIndex}, using fallback`);
            metadata = await generateFallbackMetadata(type, tokenId, rarity);
          } else {
            // 更新 token ID 相關信息 - 使用增強的名稱格式
            metadata.name = generateEnhancedNFTName(type, tokenId, rarity);
            metadata.image = `${FRONTEND_DOMAIN}/images/${type}/${type}-${rarityIndex}.png`;
            metadata.source = 'static';
            
            metadata.attributes = metadata.attributes.map(attr => {
              if (attr.trait_type === 'Token ID') {
                return { ...attr, value: parseInt(tokenId) };
              }
              return attr;
            });
            
            // 如果沒有 Token ID 屬性，添加一個
            if (!metadata.attributes.find(attr => attr.trait_type === 'Token ID')) {
              metadata.attributes.push({ trait_type: 'Token ID', value: parseInt(tokenId) });
            }
          }
          
            nftData = {
              ...metadata,
              id: tokenId,
              contractAddress: CONTRACTS[type],
              type
            };
          }
        }
        
        // 檢查是否需要從市場更新資料（暫時禁用，因為市場 API 有問題）
        if (false && nftData.source === 'static' && shouldUpdateFromMarket(nftData.lastUpdated || 0, 60)) {
          try {
            const marketData = await fetchFromNFTMarket(type, tokenId, CONTRACTS[type]);
            if (marketData) {
              nftData = {
                ...nftData,
                ...marketData,
                source: 'market_enhanced'
              };
              console.log(`🔄 從市場更新 ${type} #${tokenId} 資料`);
            }
          } catch (error) {
            console.warn(`市場更新失敗 ${type} #${tokenId}: ${error.message}`);
          }
        }
        
        // 快取 1 分鐘
        cache.set(cacheKey, nftData, 60);
        
        // 如果是熱門 NFT，加入熱門快取
        if (parseInt(tokenId) <= 100) {
          hotNftCache.set(cacheKey, nftData, 300);
        }
        
      } catch (error) {
        console.error(`Failed to fetch ${type} #${tokenId}:`, error.message);
        // 如果 URL 參數提供了 rarity 且有效，使用它；否則讓 generateFallbackMetadata 從合約讀取
        const providedRarity = rarity ? parseInt(rarity) : null;
        nftData = {
          ...(await generateFallbackMetadata(type, tokenId, providedRarity)),
          id: tokenId,
          contractAddress: CONTRACTS[type],
          type,
          source: 'fallback'
        };
      }
    }
    
    // Standardize metadata for all markets (originally OKX-specific)
    nftData = standardizeMetadata(nftData, type, tokenId);
    
    res.json(nftData);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch NFT',
      message: error.message
    });
  }
});

// 獲取玩家資產（支援分頁、排序、篩選）
app.get('/api/player/:owner/assets', async (req, res) => {
  try {
    const { owner } = req.params;
    const { 
      type, 
      rarity, 
      page = 1, 
      limit = 20, 
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const first = parseInt(limit);
    
    const cacheKey = generateCacheKey('player-assets', { owner, type, rarity, page, limit, sortBy, sortOrder });
    let assets = cache.get(cacheKey);
    
    if (!assets) {
      const data = await queryGraphQL(GRAPHQL_QUERIES.getPlayerAssets, {
        owner: owner.toLowerCase(),
        first,
        skip
      });
      
      if (data?.player) {
        let allAssets = [];
        
        // 合併所有資產
        if (!type || type === 'hero') {
          allAssets.push(...(data.player.heros || []).map(h => ({ ...h, nftType: 'hero' })));
        }
        if (!type || type === 'relic') {
          allAssets.push(...(data.player.relics || []).map(r => ({ ...r, nftType: 'relic' })));
        }
        if (!type || type === 'party') {
          allAssets.push(...(data.player.parties || []).map(p => ({ ...p, nftType: 'party' })));
        }
        
        // 篩選稀有度
        if (rarity) {
          allAssets = allAssets.filter(asset => asset.rarity === parseInt(rarity));
        }
        
        // 排序
        allAssets.sort((a, b) => {
          const aValue = a[sortBy] || 0;
          const bValue = b[sortBy] || 0;
          return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
        });
        
        assets = {
          assets: allAssets,
          pagination: {
            page: parseInt(page),
            limit: first,
            total: allAssets.length,
            hasMore: allAssets.length === first
          },
          source: 'subgraph'
        };
      } else {
        assets = {
          assets: [],
          pagination: {
            page: parseInt(page),
            limit: first,
            total: 0,
            hasMore: false
          },
          source: 'fallback'
        };
      }
      
      // 快取 2 分鐘
      cache.set(cacheKey, assets, 120);
    }
    
    res.json(assets);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch player assets',
      message: error.message
    });
  }
});

// 獲取統計數據
app.get('/api/stats', async (req, res) => {
  try {
    const cacheKey = 'stats';
    let stats = cache.get(cacheKey);
    
    if (!stats) {
      const data = await queryGraphQL(GRAPHQL_QUERIES.getStats);
      stats = {
        ...data.stats,
        source: 'subgraph',
        lastUpdated: new Date().toISOString()
      };
      
      // 快取 5 分鐘
      cache.set(cacheKey, stats, 300);
    }
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch stats',
      message: error.message
    });
  }
});

// 熱門 NFT 端點
app.get('/api/hot/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { limit = 10 } = req.query;
    
    if (!['hero', 'relic', 'party'].includes(type)) {
      return res.status(400).json({ error: 'Invalid NFT type' });
    }
    
    const cacheKey = `hot-${type}-${limit}`;
    let hotNfts = hotNftCache.get(cacheKey);
    
    if (!hotNfts) {
      // 從快取中獲取熱門 NFT
      const allKeys = hotNftCache.keys().filter(key => key.includes(`${type}-`));
      const nfts = allKeys.slice(0, parseInt(limit)).map(key => hotNftCache.get(key));
      
      hotNfts = {
        nfts,
        source: 'cache',
        lastUpdated: new Date().toISOString()
      };
      
      // 快取 10 分鐘
      hotNftCache.set(cacheKey, hotNfts, 600);
    }
    
    res.json(hotNfts);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch hot NFTs',
      message: error.message
    });
  }
});

// 清除快取端點（僅開發環境）
if (process.env.NODE_ENV === 'development') {
  app.post('/api/cache/clear', (req, res) => {
    cache.flushAll();
    hotNftCache.flushAll();
    res.json({ message: 'Cache cleared successfully' });
  });
}

// 配置刷新端點
app.post('/api/config/refresh', async (req, res) => {
  try {
    console.log('🔄 手動刷新配置...');
    
    // 強制重新載入配置
    configLoader.config = null;
    configLoader.lastFetch = 0;
    
    const config = await configLoader.loadConfig();
    
    // 更新合約地址
    CONTRACTS = {
      hero: config.contracts.HERO_ADDRESS || CONTRACTS.hero,
      relic: config.contracts.RELIC_ADDRESS || CONTRACTS.relic,
      party: config.contracts.PARTY_ADDRESS || CONTRACTS.party,
      vip: config.contracts.VIPSTAKING_ADDRESS || CONTRACTS.vip,
      playerprofile: config.contracts.PLAYERPROFILE_ADDRESS || CONTRACTS.playerprofile
    };
    
    // 更新 The Graph URL
    if (config.subgraph?.url) {
      global.THE_GRAPH_API_URL = config.subgraph.url;
    }
    
    res.json({
      message: 'Configuration refreshed successfully',
      version: config.version,
      contracts: Object.keys(CONTRACTS).length,
      subgraph: config.subgraph?.url ? 'updated' : 'unchanged'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to refresh configuration',
      message: error.message
    });
  }
});

// 診斷端點 - 測試市場適配器
app.get('/api/:type/:tokenId/debug', async (req, res) => {
  try {
    const { type, tokenId } = req.params;
    const { marketplace } = req.query;
    
    if (!['hero', 'relic', 'party', 'vip', 'vipstaking', 'playerprofile'].includes(type)) {
      return res.status(400).json({ error: 'Invalid NFT type' });
    }
    
    // 獲取原始 metadata
    const cacheKey = generateCacheKey(`${type}-${tokenId}`, {});
    let nftData = cache.get(cacheKey);
    
    if (!nftData) {
      // 生成 fallback metadata
      nftData = await generateFallbackMetadata(type, tokenId);
    }
    
    // 檢測或使用指定的市場
    const detectedMarketplace = marketplace || MarketplaceAdapter.detectMarketplace(req.headers);
    
    // 創建適配器
    const adapter = MarketplaceAdapter.create(detectedMarketplace, nftData, {
      type,
      tokenId,
      contractAddress: CONTRACTS[type],
      frontendDomain: FRONTEND_DOMAIN
    });
    
    // 獲取原始和適配後的 metadata
    const originalMetadata = JSON.parse(JSON.stringify(nftData));
    const adaptedMetadata = adapter.adapt();
    
    // 驗證
    const validation = adapter.validate ? adapter.validate() : { valid: true };
    
    res.json({
      debug: true,
      marketplace: detectedMarketplace,
      headers: {
        'user-agent': req.headers['user-agent'],
        'referer': req.headers['referer'],
        'origin': req.headers['origin']
      },
      original: originalMetadata,
      adapted: adaptedMetadata,
      validation,
      changes: {
        nameChanged: originalMetadata.name !== adaptedMetadata.name,
        attributesChanged: JSON.stringify(originalMetadata.attributes) !== JSON.stringify(adaptedMetadata.attributes),
        imageChanged: originalMetadata.image !== adaptedMetadata.image
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Debug failed',
      message: error.message
    });
  }
});

// 強制刷新特定NFT快取
app.post('/api/:type/:tokenId/refresh', async (req, res) => {
  try {
    const { type, tokenId } = req.params;
    
    if (!['hero', 'relic', 'party', 'vip', 'vipstaking', 'playerprofile'].includes(type)) {
      return res.status(400).json({ error: 'Invalid NFT type' });
    }
    
    const cacheKey = generateCacheKey(`${type}-${tokenId}`, {});
    
    // 清除快取
    cache.del(cacheKey);
    hotNftCache.del(cacheKey);
    
    // 嘗試從市場獲取最新資料
    try {
      const marketData = await fetchFromNFTMarket(type, tokenId, CONTRACTS[type]);
      if (marketData) {
        res.json({
          message: 'Cache refreshed successfully',
          data: marketData,
          source: 'market'
        });
        return;
      }
    } catch (error) {
      console.warn(`市場刷新失敗: ${error.message}`);
    }
    
    res.json({
      message: 'Cache cleared, will fetch fresh data on next request',
      source: 'cache_cleared'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to refresh cache',
      message: error.message
    });
  }
});

// 根路徑
app.get('/', async (req, res) => {
  const currentConfig = await configLoader.loadConfig();
  
  res.json({
    service: 'Dungeon Delvers Metadata Server',
    version: '1.3.0',
    configVersion: currentConfig.version,
    description: 'Advanced metadata server with GraphQL integration and dynamic configuration',
    endpoints: [
      'GET /health',
      'GET /api/sync-status',
      'GET /api/:type/:tokenId',
      'GET /api/player/:owner/assets',
      'GET /api/stats',
      'GET /api/hot/:type',
      'POST /api/cache/clear (dev only)',
      'POST /api/config/refresh'
    ],
    features: {
      dynamicConfig: true,
      configSource: currentConfig.version ? 'remote' : 'env',
      autoRefresh: true
    }
  });
});

// 404 處理
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /health',
      'GET /api/sync-status',
      'GET /api/:type/:tokenId',
      'GET /api/player/:owner/assets',
      'GET /api/stats',
      'GET /api/hot/:type'
    ]
  });
});

// 錯誤處理中間件
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// =================================================================
// Section: 服務啟動
// =================================================================

// 預緩存統計數據
let preheatStats = {
  processed: 0,
  failed: 0,
  skipped: 0,
  rpcCalls: 0,
  lastRun: null,
  avgProcessingTime: 0
};

// RPC 調用速率控制
let rpcCallHistory = [];

// 檢查 RPC 調用速率
function checkRpcRateLimit() {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  
  // 清理過期記錄
  rpcCallHistory = rpcCallHistory.filter(time => time > oneMinuteAgo);
  
  return rpcCallHistory.length < PREHEAT_CONFIG.maxRpcCallsPerMinute;
}

// 記錄 RPC 調用
function recordRpcCall() {
  rpcCallHistory.push(Date.now());
  preheatStats.rpcCalls++;
}

// 自適應並發控制
function getAdaptiveConcurrency(failureRate, avgResponseTime) {
  if (!PREHEAT_CONFIG.enableAdaptiveConcurrency) {
    return PREHEAT_CONFIG.baseConcurrency;
  }
  
  let concurrency = PREHEAT_CONFIG.baseConcurrency;
  
  // 根據失敗率調整
  if (failureRate > 0.1) { // 失敗率超過 10%
    concurrency = Math.max(5, concurrency * 0.5);
  } else if (failureRate < 0.02) { // 失敗率低於 2%
    concurrency = Math.min(PREHEAT_CONFIG.maxConcurrency, concurrency * 1.5);
  }
  
  // 根據響應時間調整
  if (avgResponseTime > 3000) { // 響應時間超過 3 秒
    concurrency = Math.max(10, concurrency * 0.7);
  }
  
  return Math.floor(concurrency);
}

// 快速預熱檢查（只檢查最近 5 分鐘）
async function quickPreheatCheck() {
  if (!PREHEAT_CONFIG.enabled) {
    return;
  }

  try {
    // 快速查詢最近 5 分鐘的 NFT
    const data = await queryGraphQL(`
      query GetVeryRecentNFTs {
        heros(first: 50, orderBy: createdAt, orderDirection: desc) {
          id tokenId createdAt
        }
        relics(first: 50, orderBy: createdAt, orderDirection: desc) {
          id tokenId createdAt
        }
        parties(first: 50, orderBy: createdAt, orderDirection: desc) {
          id tokenId createdAt
        }
      }
    `);

    const cutoffTime = Date.now() - (PREHEAT_CONFIG.quickLookbackMinutes * 60 * 1000);
    let urgentNFTs = [];
    
    ['heros', 'relics', 'parties'].forEach(nftType => {
      const type = nftType === 'heros' ? 'hero' : nftType === 'relics' ? 'relic' : 'party';
      
      if (data?.[nftType]) {
        data[nftType].forEach(nft => {
          const createdTime = parseInt(nft.createdAt) * 1000;
          
          if (createdTime > cutoffTime) {
            const cacheKey = generateCacheKey(`${type}-${nft.tokenId}`, {});
            
            if (!cache.get(cacheKey)) {
              urgentNFTs.push({ 
                type, 
                tokenId: nft.tokenId, 
                createdAt: createdTime,
                retries: 0
              });
            }
          }
        });
      }
    });

    if (urgentNFTs.length > 0) {
      console.log(`🚨 快速預熱: 發現 ${urgentNFTs.length} 個緊急 NFT`);
      
      // 高優先級處理，使用最大並發
      const chunks = [];
      for (let i = 0; i < urgentNFTs.length; i += PREHEAT_CONFIG.maxConcurrency) {
        chunks.push(urgentNFTs.slice(i, i + PREHEAT_CONFIG.maxConcurrency));
      }

      for (const chunk of chunks) {
        const promises = chunk.map(nft => preheatSingleNFT(nft));
        await Promise.allSettled(promises);
      }
      
      console.log(`⚡ 快速預熱完成: ${urgentNFTs.length} 個 NFT`);
    }
  } catch (error) {
    console.warn('⚠️ 快速預熱失敗:', error.message);
  }
}

// NFT 預緩存機制（增強版）
async function preheatNewNFTs(isFullCheck = true) {
  if (!PREHEAT_CONFIG.enabled) {
    return;
  }

  const startTime = Date.now();
  console.log('🔥 開始預熱新 NFT...');

  try {
    // 檢查子圖中的最新 NFT（增加查詢數量）
    const data = await queryGraphQL(`
      query GetRecentNFTs {
        heros(first: 100, orderBy: createdAt, orderDirection: desc) {
          id tokenId createdAt
        }
        relics(first: 100, orderBy: createdAt, orderDirection: desc) {
          id tokenId createdAt
        }
        parties(first: 100, orderBy: createdAt, orderDirection: desc) {
          id tokenId createdAt
        }
      }
    `);

    const recentNFTs = [];
    const lookbackTime = isFullCheck ? PREHEAT_CONFIG.lookbackMinutes : PREHEAT_CONFIG.quickLookbackMinutes;
    const cutoffTime = Date.now() - (lookbackTime * 60 * 1000);
    
    // 收集最近的 NFT
    ['heros', 'relics', 'parties'].forEach(nftType => {
      const type = nftType === 'heros' ? 'hero' : nftType === 'relics' ? 'relic' : 'party';
      
      if (data?.[nftType]) {
        data[nftType].forEach(nft => {
          const createdTime = parseInt(nft.createdAt) * 1000;
          
          if (createdTime > cutoffTime) {
            const cacheKey = generateCacheKey(`${type}-${nft.tokenId}`, {});
            
            // 檢查是否已緩存
            if (!cache.get(cacheKey)) {
              recentNFTs.push({ 
                type, 
                tokenId: nft.tokenId, 
                createdAt: createdTime,
                retries: 0
              });
            } else {
              preheatStats.skipped++;
            }
          }
        });
      }
    });

    console.log(`📊 發現 ${recentNFTs.length} 個未緩存的 NFT`);
    
    if (recentNFTs.length === 0) {
      console.log('✅ 沒有需要預熱的 NFT');
      return;
    }

    // 計算自適應並發數
    const failureRate = preheatStats.processed > 0 ? preheatStats.failed / preheatStats.processed : 0;
    const currentConcurrency = getAdaptiveConcurrency(failureRate, preheatStats.avgProcessingTime);
    
    console.log(`⚙️ 使用並發數: ${currentConcurrency} (失敗率: ${(failureRate * 100).toFixed(1)}%)`);

    // 分批處理
    const batches = [];
    for (let i = 0; i < recentNFTs.length; i += PREHEAT_CONFIG.batchSize) {
      batches.push(recentNFTs.slice(i, i + PREHEAT_CONFIG.batchSize));
    }

    let totalProcessed = 0;
    let totalFailed = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`📦 處理批次 ${batchIndex + 1}/${batches.length} (${batch.length} 個 NFT)`);

      // 分組並發處理
      const chunks = [];
      for (let i = 0; i < batch.length; i += currentConcurrency) {
        chunks.push(batch.slice(i, i + currentConcurrency));
      }

      for (const chunk of chunks) {
        // 檢查 RPC 速率限制
        if (!checkRpcRateLimit()) {
          console.warn('⚠️ RPC 速率限制，等待 10 秒...');
          await new Promise(resolve => setTimeout(resolve, 10000));
          continue;
        }

        const chunkPromises = chunk.map(async (nft) => {
          return preheatSingleNFT(nft);
        });

        const results = await Promise.allSettled(chunkPromises);
        
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            if (result.value) {
              totalProcessed++;
              console.log(`✅ 預熱成功: ${chunk[index].type} #${chunk[index].tokenId}`);
            } else {
              totalFailed++;
            }
          } else {
            totalFailed++;
            console.warn(`❌ 預熱失敗: ${chunk[index].type} #${chunk[index].tokenId}: ${result.reason}`);
          }
        });

        // 批次間延遲
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, PREHEAT_CONFIG.batchDelay));
        }
      }
    }

    // 更新統計
    preheatStats.processed += totalProcessed;
    preheatStats.failed += totalFailed;
    preheatStats.lastRun = new Date().toISOString();
    preheatStats.avgProcessingTime = Date.now() - startTime;

    console.log(`🔥 預熱完成: 成功 ${totalProcessed}, 失敗 ${totalFailed}, 總耗時 ${(Date.now() - startTime)/1000}s`);

  } catch (error) {
    console.error('❌ 預熱過程失敗:', error.message);
    preheatStats.failed++;
  }
}

// 單個 NFT 預熱處理
async function preheatSingleNFT(nft) {
  const startTime = Date.now();
  
  try {
    recordRpcCall();
    
    // 預先獲取稀有度
    const rarity = await getRarityFromContract(nft.type, nft.tokenId);
    
    if (rarity) {
      const metadata = await generateMetadata(nft.type, nft.tokenId, rarity);
      const cacheKey = generateCacheKey(`${nft.type}-${nft.tokenId}`, {});
      
      // 根據 NFT 年齡決定緩存時間
      const nftAge = Date.now() - nft.createdAt;
      const isVeryNewNFT = nftAge < (24 * 60 * 60 * 1000); // 24 小時內算很新 NFT
      const isNewNFT = nftAge < (30 * 24 * 60 * 60 * 1000); // 30 天內算新 NFT
      
      let cacheTime;
      if (isVeryNewNFT) {
        cacheTime = PREHEAT_CONFIG.newNftCacheTTL; // 90 天緩存
      } else if (isNewNFT) {
        cacheTime = PREHEAT_CONFIG.newNftCacheTTL; // 90 天緩存
      } else {
        cacheTime = PREHEAT_CONFIG.permanentCacheTTL; // 1 年緩存
      }
      cache.set(cacheKey, {
        ...metadata,
        cached: Date.now(),
        source: 'preheated',
        permanent: !isNewNFT
      }, cacheTime);
      
      // 如果是熱門 NFT，也加入熱門緩存
      if (parseInt(nft.tokenId) <= 1000) {
        hotNftCache.set(cacheKey, metadata, cacheTime);
      }
      
      return true;
    }
    
    return false;
  } catch (error) {
    // 重試邏輯
    if (nft.retries < PREHEAT_CONFIG.maxRetries) {
      nft.retries++;
      console.warn(`🔄 重試 ${nft.type} #${nft.tokenId} (第 ${nft.retries} 次)`);
      
      await new Promise(resolve => setTimeout(resolve, PREHEAT_CONFIG.retryDelay));
      return preheatSingleNFT(nft);
    }
    
    throw error;
  }
}

// 生成元數據的輔助函數
async function generateMetadata(type, tokenId, rarity) {
  const rarityIndex = Math.max(1, Math.min(5, rarity));
  
  return {
    name: `${type.charAt(0).toUpperCase() + type.slice(1)} #${tokenId}`,
    description: `Dungeon Delvers ${type} with rarity ${rarity}`,
    image: `${FRONTEND_DOMAIN}/images/${type}/${type}-${rarityIndex}.png`,
    attributes: [
      { trait_type: 'Token ID', value: parseInt(tokenId) },
      { trait_type: 'Rarity', value: rarity },
      { trait_type: 'Data Source', value: 'Preheated' }
    ],
    tokenId: tokenId.toString(),
    source: 'preheated'
  };
}

// 啟動服務器
async function startServer() {
  // 初始化配置
  await initializeConfig();
  
  app.listen(PORT, () => {
    console.log(`🚀 Metadata Server v1.3.0 running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`📊 Sync status: http://localhost:${PORT}/api/sync-status`);
    console.log(`🎮 NFT API: http://localhost:${PORT}/api/:type/:tokenId`);
    console.log(`🔄 Refresh API: http://localhost:${PORT}/api/:type/:tokenId/refresh`);
    console.log(`👤 Player assets: http://localhost:${PORT}/api/player/:owner/assets`);
    console.log(`📈 Stats: http://localhost:${PORT}/api/stats`);
    console.log(`🔥 Hot NFTs: http://localhost:${PORT}/api/hot/:type`);
    console.log(`📁 Reading JSON files from: ${JSON_BASE_PATH}`);
    console.log(`🌐 Using full HTTPS URLs for images: ${FRONTEND_DOMAIN}/images/`);
    console.log(`🔄 BSC Market integration: OKX (Primary marketplace for BSC NFTs)`);
    console.log(`⚡ Cache TTL: 60s (normal), 300s (hot NFTs), 24h (preheated)`);
    console.log(`🎯 Priority: OKX > Metadata Server (OKX is the only active BSC NFT marketplace)`);
    console.log(`⚙️ Dynamic Config: ${process.env.CONFIG_URL || 'https://dungeondelvers.xyz/config/v15.json'}`);
    
    // 啟動預熱機制
    if (PREHEAT_CONFIG.enabled) {
      console.log(`🔥 NFT Preheat: Every ${PREHEAT_CONFIG.interval/60000} minutes`);
      console.log(`📊 Concurrency: ${PREHEAT_CONFIG.baseConcurrency}-${PREHEAT_CONFIG.maxConcurrency} (adaptive)`);
      console.log(`📦 Batch size: ${PREHEAT_CONFIG.batchSize}, delay: ${PREHEAT_CONFIG.batchDelay}ms`);
      console.log(`🔄 Max RPC calls: ${PREHEAT_CONFIG.maxRpcCallsPerMinute}/min`);
      
      // 立即執行一次完整預熱（服務器啟動後）
      setTimeout(() => preheatNewNFTs(true), 30000); // 30 秒後開始完整檢查
      
      // 定期執行完整檢查
      setInterval(() => preheatNewNFTs(true), PREHEAT_CONFIG.interval);
      
      // 每 30 秒快速檢查最近 5 分鐘的鑄造
      setInterval(quickPreheatCheck, PREHEAT_CONFIG.quickInterval);
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔧 Development mode: Local static files available at /images and /assets`);
    }
  });
}

// 啟動
startServer().catch(error => {
  console.error('❌ 服務器啟動失敗:', error);
  process.exit(1);
});

module.exports = app;
