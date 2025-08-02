// index.js (優化版 - 結合靜態 JSON 與 GraphQL 查詢)

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const NodeCache = require('node-cache');
const axios = require('axios');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { getRarityFromMapping } = require('./rarityMapping');
const { getRarityFromContract } = require('./contractReader');
const { getPartyImageByPower, getPartyTierByPower } = require('./partyImageHelper');
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

// NFT 預緩存機制配置 - 智慧型按需預熱
const PREHEAT_CONFIG = {
  enabled: process.env.PREHEAT_ENABLED !== 'false',
  mode: 'on-demand', // 改為按需預熱模式
  
  // 大幅減少定時檢查
  interval: parseInt(process.env.PREHEAT_INTERVAL) || 30 * 60 * 1000, // 30 分鐘
  quickInterval: 5 * 60 * 1000, // 5 分鐘
  lookbackMinutes: 15, // 只檢查最近 15 分鐘
  quickLookbackMinutes: 3, // 快速檢查只看 3 分鐘
  
  // 最小化並發數
  baseConcurrency: 2,
  maxConcurrency: 4,
  batchSize: 5,
  batchDelay: 3000, // 增加延遲到 3 秒
  
  maxRetries: 1, // 減少重試
  retryDelay: 10000,
  
  // 按需預熱配置
  onDemandEnabled: true,       // 啟用按需預熱
  onDemandDelay: 2000,        // 用戶請求後 2 秒開始預熱
  priorityTypes: ['hero', 'relic', 'party'], // 優先預熱：英雄、聖物、隊伍
  skipTypes: ['vip', 'vipstaking', 'playerprofile'], // 跳過預熱：VIP 和個人檔案
  
  // 突發鑄造檢測與處理
  burstDetection: {
    enabled: true,
    threshold: 20,              // 5分鐘內超過20個新NFT視為突發
    timeWindow: 5 * 60 * 1000,  // 5分鐘時間窗口
    emergencyConcurrency: 12,   // 突發時提升並發到12
    emergencyDuration: 10 * 60 * 1000, // 突發模式持續10分鐘
    reducedDelay: 500,          // 突發時減少延遲到0.5秒
  },
  
  // 智能緩存策略
  newNftCacheTTL: 24 * 60 * 60,
  permanentCacheTTL: 7 * 24 * 60 * 60,
  cacheTTL: 12 * 60 * 60,
  
  maxRpcCallsPerMinute: 30, // 進一步降低
  enableAdaptiveConcurrency: false,
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

// 統一緩存配置 - 優化版
const cache = new NodeCache({ 
  stdTTL: 300, // 預設 5 分鐘（合理的平衡點）
  checkperiod: 120, // 2 分鐘檢查一次（減少 CPU 消耗）
  maxKeys: 2000, // 增加容量（合併了 3 個緩存）
  useClones: false // 提升性能，不複製對象
});

// 緩存 TTL 策略
const CACHE_TTL = {
  hero: 24 * 60 * 60,        // 24小時（靜態數據）
  relic: 24 * 60 * 60,       // 24小時（靜態數據）
  party: 24 * 60 * 60,       // 24小時（靜態數據，變化數據已移除）
  vip: 30 * 60,              // 30分鐘（會變化）
  vipstaking: 30 * 60,       // 30分鐘（會變化）
  playerprofile: 5 * 60,     // 5分鐘（頻繁變化）
  
  // 特殊狀態
  indexing: 2 * 60,          // 2分鐘（正在索引）
  placeholder: 1 * 60,       // 1分鐘（佔位符）
  
  // 系統數據
  config: 5 * 60,            // 5分鐘（配置數據）
  stats: 5 * 60,             // 5分鐘（統計數據）
};

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

// JSON 文件路徑配置 - 使用後端自己的 api 目錄
const JSON_BASE_PATH = path.join(__dirname, '../../api');

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

// BSC RPC 端點配置（多節點容錯）
const BSC_RPC_ENDPOINTS = [
  'https://bsc-dataseed1.binance.org/',
  'https://bsc-dataseed2.binance.org/',
  'https://bsc-dataseed3.binance.org/',
  'https://bsc-dataseed4.binance.org/',
  'https://bsc-dataseed1.defibit.io/',
  'https://bsc-dataseed2.defibit.io/'
];

// 創建 ethers provider（帶容錯機制）
let provider;
let currentRpcIndex = 0;

function createProvider() {
  try {
    const rpcUrl = BSC_RPC_ENDPOINTS[currentRpcIndex];
    console.log(`🔗 嘗試連接 BSC RPC: ${rpcUrl}`);
    provider = new ethers.JsonRpcProvider(rpcUrl);
    return provider;
  } catch (error) {
    console.error(`❌ RPC 連接失敗: ${error.message}`);
    // 嘗試下一個 RPC
    currentRpcIndex = (currentRpcIndex + 1) % BSC_RPC_ENDPOINTS.length;
    if (currentRpcIndex === 0) {
      throw new Error('所有 BSC RPC 端點都無法連接');
    }
    return createProvider();
  }
}

// VIP Staking 合約 ABI（需要 getVipLevel 和 ownerOf 函數）
const VIP_STAKING_ABI = [
  {
    "inputs": [{"internalType": "address", "name": "user", "type": "address"}],
    "name": "getVipLevel",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}],
    "name": "ownerOf",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  }
];

// VIP 等級緩存已整合到統一緩存中

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
        id tokenId owner { id } power rarity createdAt contractAddress
      }
      relic(id: $nftId) {
        id tokenId owner { id } capacity rarity createdAt contractAddress
      }
      party(id: $nftId) {
        id tokenId owner { id } totalPower totalCapacity partyRarity createdAt contractAddress
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

// VIP 等級讀取函數（帶緩存和容錯）
/**
 * 根據 VIP tokenId 自動獲取 owner 和等級
 */
async function getVipDataByTokenId(tokenId) {
  try {
    // 確保 provider 存在
    if (!provider) {
      provider = createProvider();
    }

    // 創建合約實例
    const vipContract = new ethers.Contract(
      CONTRACTS.vip,
      VIP_STAKING_ABI,
      provider
    );

    console.log(`🔍 查詢 VIP #${tokenId} 的 owner...`);
    
    // 1. 先獲取 NFT 的 owner
    const owner = await vipContract.ownerOf(tokenId);
    console.log(`✅ VIP #${tokenId} owner: ${owner}`);
    
    // 2. 獲取該 owner 的 VIP 等級
    const level = await vipContract.getVipLevel(owner);
    const vipLevel = Number(level);
    
    console.log(`✅ VIP 等級獲取成功: ${owner} -> Level ${vipLevel}`);

    // 緩存結果（30 分鐘）
    const cacheKey = `vip-data-${tokenId}`;
    const data = { owner, level: vipLevel };
    cache.set(cacheKey, data, CACHE_TTL.vip);

    return data;
    
  } catch (error) {
    console.error(`❌ 獲取 VIP #${tokenId} 數據失敗:`, error.message);
    
    // 如果是 tokenId 不存在的錯誤，返回 null
    if (error.message?.includes('nonexistent token') || error.message?.includes('invalid token')) {
      return null;
    }
    
    // 其他錯誤，返回默認數據
    return { owner: null, level: 0 };
  }
}

// 獲取玩家檔案數據 (playerprofile)
async function getPlayerProfileData(tokenId) {
  console.log(`🔍 獲取玩家檔案 #${tokenId} 數據...`);
  
  try {
    // 確保 provider 存在
    if (!provider) {
      provider = createProvider();
    }

    // 創建合約實例
    const { playerProfileABI } = require('./abis');
    const profileContract = new ethers.Contract(
      CONTRACTS.playerprofile,
      playerProfileABI,
      provider
    );

    // 1. 先獲取 NFT 的 owner
    const owner = await profileContract.ownerOf(tokenId);
    console.log(`✅ Profile #${tokenId} owner: ${owner}`);
    
    // 2. 獲取玩家的經驗值和等級
    const experience = await profileContract.getExperience(owner);
    const level = await profileContract.getLevel(owner);
    
    // 3. 獲取 profileData（如果有額外數據）
    let profileDataResult = null;
    try {
      profileDataResult = await profileContract.profileData(tokenId);
    } catch (profileDataError) {
      console.warn(`無法獲取 profileData: ${profileDataError.message}`);
    }
    
    const profileData = {
      owner,
      experience: Number(experience),
      level: Number(level),
      adventures: 0 // 目前沒有這個欄位，設為 0
    };
    
    console.log(`✅ 玩家檔案數據獲取成功:`, profileData);
    return profileData;
    
  } catch (error) {
    console.error(`❌ 獲取玩家檔案 #${tokenId} 數據失敗:`, error.message);
    
    // 如果是 tokenId 不存在的錯誤，返回 null
    if (error.message?.includes('nonexistent token') || error.message?.includes('invalid token')) {
      return null;
    }
    
    // 其他錯誤，返回默認數據
    return { owner: null, experience: 0, level: 1, adventures: 0 };
  }
}

async function getVipLevel(userAddress) {
  if (!userAddress || !ethers.isAddress(userAddress)) {
    console.warn(`❌ 無效的地址格式: ${userAddress}`);
    return 0;
  }

  // 檢查快取
  const cacheKey = `vip-level-${userAddress.toLowerCase()}`;
  const cachedLevel = cache.get(cacheKey);
  if (cachedLevel !== undefined) {
    console.log(`🎯 VIP 等級快取命中: ${userAddress} -> Level ${cachedLevel}`);
    return cachedLevel;
  }

  try {
    // 確保 provider 存在
    if (!provider) {
      provider = createProvider();
    }

    // 創建合約實例
    const vipContract = new ethers.Contract(
      CONTRACTS.vip,
      VIP_STAKING_ABI,
      provider
    );

    console.log(`🔍 讀取 VIP 等級: ${userAddress}`);
    
    // 調用合約函數
    const level = await vipContract.getVipLevel(userAddress);
    const vipLevel = Number(level);

    console.log(`✅ VIP 等級讀取成功: ${userAddress} -> Level ${vipLevel}`);

    // 緩存結果（30 分鐘）
    cache.set(cacheKey, vipLevel, CACHE_TTL.vip);

    return vipLevel;

  } catch (error) {
    console.error(`❌ VIP 等級讀取失敗: ${userAddress}`, error.message);

    // 如果是 RPC 問題，嘗試切換節點
    if (error.message.includes('network') || error.message.includes('timeout')) {
      console.log('🔄 RPC 問題，嘗試切換節點...');
      try {
        currentRpcIndex = (currentRpcIndex + 1) % BSC_RPC_ENDPOINTS.length;
        provider = createProvider();
        
        // 重試一次
        const vipContract = new ethers.Contract(
          CONTRACTS.vip,
          VIP_STAKING_ABI,
          provider
        );
        
        const level = await vipContract.getVipLevel(userAddress);
        const vipLevel = Number(level);
        
        console.log(`✅ VIP 等級重試成功: ${userAddress} -> Level ${vipLevel}`);
        cache.set(cacheKey, vipLevel, CACHE_TTL.vip);
        return vipLevel;
        
      } catch (retryError) {
        console.error(`❌ VIP 等級重試也失敗: ${retryError.message}`);
      }
    }

    // 返回默認值 0，並緩存短時間（5 分鐘）避免重複嘗試
    cache.set(cacheKey, 0, CACHE_TTL.vip);
    return 0;
  }
}

// 靜態文件處理函數
async function tryStaticFile(type, tokenId, res) {
  try {
    const staticFilePath = path.join(__dirname, '../static/metadata', type, `${tokenId}.json`);
    
    // 檢查靜態文件是否存在
    const fs = require('fs').promises;
    
    try {
      const staticContent = await fs.readFile(staticFilePath, 'utf8');
      const staticMetadata = JSON.parse(staticContent);
      
      // 設置靜態文件響應標頭
      res.set({
        'Cache-Control': 'public, max-age=31536000', // 1 年緩存
        'X-Cache-Status': 'STATIC-HIT',
        'X-Source': 'static-file',
        'X-File-Generated': staticMetadata.generated_at || 'unknown',
        'X-Cache-Version': staticMetadata.cache_version || 'v1',
        'Content-Type': 'application/json'
      });
      
      // 更新靜態文件命中統計
      if (global.staticMetrics) {
        global.staticMetrics.hits++;
      }
      
      res.json(staticMetadata);
      console.log(`⚡ 靜態文件命中: ${type} #${tokenId}`);
      return true;
      
    } catch (fileError) {
      // 文件不存在或讀取失敗，繼續動態處理
      if (fileError.code !== 'ENOENT') {
        console.warn(`⚠️ 讀取靜態文件失敗: ${type} #${tokenId} - ${fileError.message}`);
      }
      
      // 更新靜態文件未命中統計
      if (global.staticMetrics) {
        global.staticMetrics.misses++;
      }
      
      return false;
    }
    
  } catch (error) {
    console.error(`❌ 靜態文件處理錯誤: ${type} #${tokenId}`, error.message);
    
    // 更新錯誤統計
    if (global.staticMetrics) {
      global.staticMetrics.errors++;
    }
    
    return false;
  }
}

// 初始化靜態文件統計
global.staticMetrics = {
  hits: 0,
  misses: 0,
  errors: 0,
  enabled: true,
  startTime: new Date().toISOString()
};

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
    // 從 URL 中提取 API Key
    const apiUrl = global.THE_GRAPH_API_URL || THE_GRAPH_API_URL;
    const urlMatch = apiUrl.match(/\/api\/([a-f0-9]{32})\//);
    const apiKey = urlMatch ? urlMatch[1] : null;
    
    // 如果有 API Key，添加到 header
    if (apiKey) {
      requestConfig.headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    const response = await axios.post(apiUrl, {
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

// GraphQL 批量查詢函數 - 優化預熱系統性能
async function queryGraphQLBatch(nftIds, batchSize = 20) {
  if (!Array.isArray(nftIds) || nftIds.length === 0) {
    return {};
  }

  console.log(`📦 [GraphQL Batch] 批量查詢 ${nftIds.length} 個 NFT (batch size: ${batchSize})`);
  
  const results = {};
  const batches = [];
  
  // 將 NFT IDs 分組
  for (let i = 0; i < nftIds.length; i += batchSize) {
    batches.push(nftIds.slice(i, i + batchSize));
  }

  // 並行處理每個批次
  const batchPromises = batches.map(async (batch, batchIndex) => {
    try {
      const batchQuery = generateBatchQuery(batch);
      console.log(`📦 [GraphQL Batch] 執行批次 ${batchIndex + 1}/${batches.length} (${batch.length} 個 NFT)`);
      
      const batchData = await queryGraphQL(batchQuery);
      
      // 處理批次結果
      batch.forEach(nftId => {
        const nftData = extractNftFromBatchResult(batchData, nftId);
        if (nftData) {
          results[nftId] = nftData;
        }
      });
      
      console.log(`✅ [GraphQL Batch] 批次 ${batchIndex + 1} 完成，獲得 ${Object.keys(results).length - (batchIndex * batchSize)} 個有效結果`);
      
    } catch (error) {
      console.error(`❌ [GraphQL Batch] 批次 ${batchIndex + 1} 失敗:`, error.message);
      // 繼續其他批次，不中斷整個過程
    }
  });

  await Promise.allSettled(batchPromises);
  
  console.log(`🎯 [GraphQL Batch] 批量查詢完成，共獲得 ${Object.keys(results).length}/${nftIds.length} 個有效結果`);
  return results;
}

// 生成批量查詢語句
function generateBatchQuery(nftIds) {
  const heroIds = nftIds.map(id => `"${id}"`).join(', ');
  const relicIds = nftIds.map(id => `"${id}"`).join(', ');
  const partyIds = nftIds.map(id => `"${id}"`).join(', ');

  return `
    query GetBatchNfts {
      heroes(where: { id_in: [${heroIds}] }, first: 1000) {
        id
        tokenId
        owner { id }
        power
        rarity
        createdAt
        contractAddress
      }
      relics(where: { id_in: [${relicIds}] }, first: 1000) {
        id
        tokenId
        owner { id }
        capacity
        rarity
        createdAt
        contractAddress
      }
      parties(where: { id_in: [${partyIds}] }, first: 1000) {
        id
        tokenId
        owner { id }
        totalPower
        totalCapacity
        partyRarity
        createdAt
        contractAddress
        heroIds
        relicIds
        heros { tokenId power rarity }
        relics { tokenId capacity rarity }
        fatigueLevel
        provisionsRemaining
        cooldownEndsAt
        unclaimedRewards
      }
    }
  `;
}

// 從批量結果中提取特定 NFT 數據
function extractNftFromBatchResult(batchData, nftId) {
  if (!batchData) return null;

  // 檢查 heroes
  if (batchData.heroes) {
    const hero = batchData.heroes.find(h => h.id === nftId || h.tokenId === nftId);
    if (hero) return { type: 'hero', data: hero };
  }

  // 檢查 relics
  if (batchData.relics) {
    const relic = batchData.relics.find(r => r.id === nftId || r.tokenId === nftId);
    if (relic) return { type: 'relic', data: relic };
  }

  // 檢查 parties
  if (batchData.parties) {
    const party = batchData.parties.find(p => p.id === nftId || p.tokenId === nftId);
    if (party) return { type: 'party', data: party };
  }

  return null;
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

// 獲取隊伍戰力範圍前綴
function getPartyPowerRangePrefix(totalPower) {
  // 使用300為單位劃分等級
  const power = parseInt(totalPower) || 0;
  const lowerBound = Math.floor(power / 300) * 300;
  const upperBound = lowerBound + 299;
  return `${lowerBound}-${upperBound}`;
}

// 生成標準 NFT 名稱（使用 UR/SSR 系統）
function generateEnhancedNFTName(type, tokenId, rarity, totalPower = null) {
  const validRarity = Math.max(1, Math.min(6, rarity || 1));
  
  // 使用與前端相同的稀有度縮寫系統
  const rarityPrefixes = {
    1: 'N',    // Normal (Common)
    2: 'R',    // Rare (Uncommon)
    3: 'SR',   // Super Rare (Rare)
    4: 'SSR',  // Super Super Rare (Epic)
    5: 'UR',   // Ultra Rare (Legendary)
    6: 'UR+'   // Ultra Rare Plus (Mythic)
  };
  
  const typeNames = {
    'hero': 'Hero',
    'relic': 'Relic', 
    'party': 'Party',
    'vip': 'VIP Pass',
    'vipstaking': 'VIP Pass',
    'playerprofile': 'Dungeon Delvers Profile'
  };
  
  const rarityPrefix = rarityPrefixes[validRarity] || '';
  const typeText = typeNames[type] || type.charAt(0).toUpperCase() + type.slice(1);
  
  // 對於 VIP 和 Profile，不使用稀有度前綴
  if (type === 'vip' || type === 'vipstaking' || type === 'playerprofile') {
    return `${typeText} #${tokenId}`;
  }
  
  // 對於 Party，使用戰力範圍前綴
  if (type === 'party' && totalPower !== null) {
    const powerPrefix = getPartyPowerRangePrefix(totalPower);
    return `${powerPrefix} ${typeText} #${tokenId}`;
  }
  
  // 對於英雄和聖物，使用稀有度前綴
  return rarityPrefix ? `${rarityPrefix} ${typeText} #${tokenId}` : `${typeText} #${tokenId}`;
}

// 生成 fallback metadata (占位符)
async function generateFallbackMetadata(type, tokenId, rarity = null) {
  // 不再進行任何稀有度計算，直接返回占位符
  console.log(`Generating placeholder for ${type} #${tokenId}`);
  
  // 嘗試從子圖獲取數據以提供更完整的占位符
  let additionalAttributes = [];
  let hasSubgraphData = false;
  let totalPower = null; // 用於隊伍名稱生成
  let profileData = null; // 用於 Profile 標題生成
  
  try {
    const contractAddress = CONTRACTS[type];
    const nftId = `${contractAddress.toLowerCase()}-${tokenId}`;
    const data = await queryGraphQL(GRAPHQL_QUERIES.getNftById, { nftId });
    
    if (data && data[type]) {
      const nft = data[type];
      hasSubgraphData = true;
      
      // 更新稀有度
      if (nft.rarity || nft.partyRarity) {
        rarity = parseInt(nft.rarity || nft.partyRarity);
      }
      
      // 添加類型特定的屬性
      if (type === 'hero' && nft.power) {
        additionalAttributes.push({
          trait_type: 'Power',
          value: parseInt(nft.power),
          display_type: 'number',
          max_value: 255
        });
      } else if (type === 'relic' && nft.capacity) {
        additionalAttributes.push({
          trait_type: 'Capacity',
          value: parseInt(nft.capacity),
          display_type: 'number',
          max_value: 5
        });
      } else if (type === 'party') {
        if (nft.totalPower) {
          totalPower = parseInt(nft.totalPower); // 保存總戰力
          additionalAttributes.push({
            trait_type: 'Total Power',
            value: totalPower,
            display_type: 'number',
            max_value: 2820
          });
        }
        if (nft.totalCapacity) {
          additionalAttributes.push({
            trait_type: 'Total Capacity',
            value: parseInt(nft.totalCapacity),
            display_type: 'number',
            max_value: 25
          });
        }
      } else if (type === 'playerprofile') {
        // 嘗試從合約獲取玩家檔案數據
        try {
          profileData = await getPlayerProfileData(tokenId);
          if (profileData) {
            additionalAttributes.push({
              trait_type: 'Experience',
              value: profileData.experience,
              display_type: 'number'
            });
            additionalAttributes.push({
              trait_type: 'Level',
              value: profileData.level,
              display_type: 'number'
            });
            additionalAttributes.push({
              trait_type: 'Total Adventures',
              value: profileData.adventures || 0,
              display_type: 'number'
            });
          }
        } catch (profileError) {
          console.warn(`無法從合約獲取玩家檔案數據:`, profileError.message);
        }
      }
    }
  } catch (error) {
    console.warn(`無法從子圖獲取 ${type} #${tokenId} 的數據:`, error.message);
  }
  
  // 根據是否有稀有度數據決定圖片
  let imageUrl;
  if (type === 'vip' || type === 'vipstaking') {
    // VIP 使用固定圖片，因為等級需要從合約讀取
    imageUrl = `${FRONTEND_DOMAIN}/images/vip/vip-1.png`;
  } else if (type === 'playerprofile') {
    // 玩家檔案使用固定圖片
    imageUrl = `${FRONTEND_DOMAIN}/images/profile/profile-1.png`;
  } else if (type === 'party' && totalPower) {
    // Party 使用基於戰力的圖片
    imageUrl = getPartyImageByPower(totalPower);
  } else if (rarity && rarity >= 1 && rarity <= 5) {
    imageUrl = `${FRONTEND_DOMAIN}/images/${type}/${type}-${rarity}.png`;
  } else {
    imageUrl = `${FRONTEND_DOMAIN}/images/${type}/${type}-placeholder.png`;
  }
  
  const baseData = {
    name: (type === 'vip' || type === 'vipstaking') 
      ? `VIP #${tokenId}` 
      : (type === 'playerprofile')
      ? (profileData?.level > 1 ? `Level ${profileData.level} Dungeon Delvers Profile #${tokenId}` : `Dungeon Delvers Profile #${tokenId}`)
      : (rarity ? generateEnhancedNFTName(type, tokenId, rarity, totalPower) : `${type.charAt(0).toUpperCase() + type.slice(1)} #${tokenId}`),
    description: (type === 'vip' || type === 'vipstaking')
      ? "Dungeon Delvers VIP - Exclusive membership with staking benefits. VIP level is determined by staked amount."
      : (type === 'playerprofile')
      ? "Dungeon Delvers Player Profile - Soul-bound achievement NFT tracking your journey through the dungeons."
      : (hasSubgraphData ? "Dungeon Delvers NFT - 從區塊鏈獲取的即時資料" : "This NFT's data is currently unavailable. Please try again later."),
    image: imageUrl,
    attributes: [
      { trait_type: "Token ID", value: parseInt(tokenId), display_type: "number" },
      ...(rarity ? [{
        trait_type: "Rarity",
        value: rarity,
        display_type: "number",
        max_value: 5
      }] : []),
      ...additionalAttributes,
      { trait_type: "Status", value: hasSubgraphData ? "Available" : "Loading" },
      { trait_type: "Data Source", value: hasSubgraphData ? "Subgraph" : "Fallback" }
    ],
    source: hasSubgraphData ? 'subgraph-fallback' : 'placeholder',
    metadata_status: hasSubgraphData ? 'final' : 'pending'
  };
  
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
      totalCacheSize: cache.keys().length,
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

// 靜態文件健康檢查
app.get('/api/static/health', (req, res) => {
  const metrics = global.staticMetrics || {
    hits: 0,
    misses: 0,
    errors: 0,
    enabled: false,
    startTime: new Date().toISOString()
  };

  const totalRequests = metrics.hits + metrics.misses;
  const hitRate = totalRequests > 0 ? (metrics.hits / totalRequests * 100).toFixed(2) : '0.00';
  
  res.json({
    static_files: {
      enabled: metrics.enabled,
      status: 'operational',
      metrics: {
        hits: metrics.hits,
        misses: metrics.misses,
        errors: metrics.errors,
        total_requests: totalRequests,
        hit_rate: `${hitRate}%`,
        hit_rate_numeric: parseFloat(hitRate)
      },
      performance: {
        start_time: metrics.startTime,
        runtime: totalRequests > 0 ? `${totalRequests} requests processed` : 'No requests yet'
      },
      directories: {
        hero_static: 'static/metadata/hero/',
        relic_static: 'static/metadata/relic/', 
        party_static: 'static/metadata/party/'
      }
    },
    recommendations: 
      totalRequests === 0 ? ['No static files accessed yet'] :
      parseFloat(hitRate) < 50 ? ['Consider generating more static files', 'Check if NFTs exist in static directory'] :
      parseFloat(hitRate) > 90 ? ['Excellent static file coverage'] :
      ['Static file coverage is good']
  });
});

// 靜態文件統計重置 
app.post('/api/static/reset', (req, res) => {
  if (global.staticMetrics) {
    const oldStats = { ...global.staticMetrics };
    global.staticMetrics = {
      hits: 0,
      misses: 0,
      errors: 0,
      enabled: true,
      startTime: new Date().toISOString()
    };
    
    res.json({
      message: 'Static file metrics reset successfully',
      previous_stats: oldStats,
      new_stats: global.staticMetrics
    });
  } else {
    res.status(400).json({ error: 'Static metrics not initialized' });
  }
});

// =================================================================
// Section: API 路由
// =================================================================

// RPC 代理服務已完全移除 - 前端使用 Vercel API 路由

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

// Profile NFT 的特殊路由（為了匹配合約的 tokenURI）
app.get('/api/profile/:tokenId', async (req, res) => {
  // 重定向到正確的 playerprofile 端點
  const { tokenId } = req.params;
  return res.redirect(301, `/api/playerprofile/${tokenId}`);
});

// 獲取特定 NFT（靜態文件優化版）
app.get('/api/:type/:tokenId', async (req, res) => {
  try {
    const { type, tokenId } = req.params;
    const { owner, rarity } = req.query;
    
    if (!['hero', 'relic', 'party', 'vip', 'vipstaking', 'playerprofile'].includes(type)) {
      return res.status(400).json({ error: 'Invalid NFT type' });
    }
    
    // 對於 Hero、Relic、Party，優先檢查靜態文件
    if (['hero', 'relic', 'party'].includes(type)) {
      const staticFileResult = await tryStaticFile(type, tokenId, res);
      if (staticFileResult) {
        return; // 靜態文件命中，直接返回
      }
    }
    
    const cacheKey = generateCacheKey(`${type}-${tokenId}`, { owner, rarity });
    let nftData = cache.get(cacheKey);
    
    if (!nftData) {
      try {
        // VIP 特殊處理：自動從合約讀取 owner 和等級
        if (type === 'vip' || type === 'vipstaking') {
          console.log(`🎯 處理 VIP metadata: ${tokenId}`);
          
          // 檢查緩存
          const cacheKey = `vip-data-${tokenId}`;
          let vipData = cache.get(cacheKey);
          
          if (!vipData) {
            // 自動從合約獲取 owner 和等級
            vipData = await getVipDataByTokenId(tokenId);
          }
          
          if (!vipData) {
            // Token 不存在
            nftData = {
              error: 'Token not found',
              message: `VIP NFT #${tokenId} does not exist`
            };
            return res.status(404).json(nftData);
          }
          
          const { owner: nftOwner, level: vipLevel } = vipData;
          
          // 如果 URL 中有 owner 參數，驗證是否匹配
          if (owner && owner.toLowerCase() !== nftOwner?.toLowerCase()) {
            console.warn(`⚠️ URL owner 參數 (${owner}) 與實際 owner (${nftOwner}) 不匹配`);
          }
          
          // 生成 VIP metadata
          nftData = {
            name: vipLevel > 0 ? `Level ${vipLevel} VIP #${tokenId}` : `VIP #${tokenId}`,
            description: vipLevel > 0 
              ? `Dungeon Delvers VIP Level ${vipLevel} - Exclusive membership with enhanced staking benefits and privileges.`
              : `Dungeon Delvers VIP - Exclusive membership with staking benefits. VIP level is determined by staked amount.`,
            image: `${FRONTEND_DOMAIN}/images/vip/vip-1.png`,
            attributes: [
              { trait_type: 'Token ID', value: parseInt(tokenId), display_type: 'number' },
              { trait_type: 'Type', value: 'VIP Membership' },
              ...(vipLevel > 0 ? [{
                trait_type: 'VIP Level',
                value: vipLevel,
                display_type: 'number',
                max_value: 10
              }] : []),
              { trait_type: 'Chain', value: 'BSC' },
              { trait_type: 'Data Source', value: 'Contract Auto-Query' },
              { trait_type: 'Owner', value: nftOwner }
            ],
            source: 'contract',
            metadata_status: 'final',
            // 額外的元數據
            id: tokenId,
            contractAddress: CONTRACTS.vip,
            type: 'vip',
            external_url: `${FRONTEND_DOMAIN}/nft/vip/${tokenId}`,
            okx_optimized: true,
            marketplace_compatibility: 'unified',
            charset: 'UTF-8',
            collection: {
              name: 'Dungeon Delvers',
              family: 'Dungeon Delvers NFT'
            }
          };
          
          console.log(`✅ VIP metadata 生成完成: ${nftOwner} Level ${vipLevel}`);
        }
        // PlayerProfile 特殊處理：自動從合約讀取玩家數據
        else if (type === 'playerprofile') {
          console.log(`👤 處理 PlayerProfile metadata: ${tokenId}`);
          
          // 自動從合約獲取玩家檔案數據
          const profileData = await getPlayerProfileData(tokenId);
          
          if (!profileData) {
            // Token 不存在
            nftData = {
              error: 'Token not found',
              message: `Player Profile NFT #${tokenId} does not exist`
            };
            return res.status(404).json(nftData);
          }
          
          const { owner: profileOwner, experience, level, adventures } = profileData;
          
          // 生成 PlayerProfile metadata
          nftData = {
            name: level > 1 ? `Level ${level} Dungeon Delvers Profile #${tokenId}` : `Dungeon Delvers Profile #${tokenId}`,
            description: `Dungeon Delvers Profile - Soul-bound achievement NFT tracking your journey through the dungeons.`,
            image: `${FRONTEND_DOMAIN}/images/profile/profile-1.png`,
            attributes: [
              { trait_type: 'Token ID', value: parseInt(tokenId), display_type: 'number' },
              { trait_type: 'Type', value: 'Dungeon Delvers Profile' },
              { trait_type: 'Experience', value: experience, display_type: 'number' },
              { trait_type: 'Level', value: level, display_type: 'number' },
              { trait_type: 'Total Adventures', value: adventures, display_type: 'number' },
              { trait_type: 'Chain', value: 'BSC' },
              { trait_type: 'Data Source', value: 'Contract Auto-Query' },
              { trait_type: 'Owner', value: profileOwner }
            ],
            source: 'contract',
            metadata_status: 'final',
            // 額外的元數據
            id: tokenId,
            contractAddress: CONTRACTS.playerprofile,
            type: 'playerprofile',
            external_url: `${FRONTEND_DOMAIN}/nft/playerprofile/${tokenId}`,
            okx_optimized: true,
            marketplace_compatibility: 'unified',
            charset: 'UTF-8',
            collection: {
              name: 'Dungeon Delvers',
              family: 'Dungeon Delvers NFT'
            }
          };
          
          console.log(`✅ PlayerProfile metadata 生成完成: ${profileOwner} Level ${level} (${experience} EXP)`);
        }
        // 先嘗試從 subgraph 獲取資料
        else if (['hero', 'relic', 'party'].includes(type)) {
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
            
            // Party 需要特殊處理圖片
            const imageUrl = type === 'party' 
              ? getPartyImageByPower(nft.totalPower)
              : `${FRONTEND_DOMAIN}/images/${type}/${type}-${rarityIndex}.png`;
            
            nftData = {
              name: generateEnhancedNFTName(type, tokenId, rarity, type === 'party' ? nft.totalPower : null),
              description: 'Dungeon Delvers NFT - 從區塊鏈獲取的即時資料',
              image: imageUrl,
              attributes: [
                { trait_type: 'Token ID', value: parseInt(tokenId) },
                { 
                  trait_type: 'Rarity', 
                  value: rarity,
                  display_type: 'number',
                  max_value: 5
                },
                ...(type === 'hero' ? [
                  { 
                    trait_type: 'Power', 
                    value: parseInt(nft.power),
                    display_type: 'number',
                    max_value: 255
                  }
                ] : type === 'relic' ? [
                  { 
                    trait_type: 'Capacity', 
                    value: parseInt(nft.capacity),
                    display_type: 'number',
                    max_value: 5
                  }
                ] : type === 'party' ? [
                  { 
                    trait_type: 'Total Power', 
                    value: parseInt(nft.totalPower),
                    display_type: 'number',
                    max_value: 2820
                  },
                  { 
                    trait_type: 'Total Capacity', 
                    value: parseInt(nft.totalCapacity),
                    display_type: 'number',
                    max_value: 25
                  },
                  { trait_type: 'Power Tier', value: getPartyTierByPower(nft.totalPower) }
                ] : [])
              ],
              source: 'subgraph',
              contractAddress,
              type,
              metadata_status: 'final',
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
            
            // 根據類型生成正確的圖片路徑
            const imageUrl = type === 'party' 
              ? `${FRONTEND_DOMAIN}/images/party/party.png` // Party 暫時使用固定圖片
              : `${FRONTEND_DOMAIN}/images/${type}/${type}-${rarityIndex}.png`;
            
            nftData = {
              name: generateEnhancedNFTName(type, tokenId, contractRarity),
              description: 'Dungeon Delvers NFT - 資料同步中',
              image: imageUrl,
              tokenId: tokenId.toString(),
              attributes: [
                { trait_type: 'Token ID', value: parseInt(tokenId), display_type: 'number' },
                { 
                  trait_type: 'Rarity', 
                  value: contractRarity,
                  display_type: 'number',
                  max_value: 5
                },
                { trait_type: "Data Source", value: "Contract (Indexing)" }
              ],
              // 添加標記表示這是臨時數據
              indexing: true,
              metadata_status: "indexing",
              retry_after: 10
            };
            console.log(`Using contract data for ${type} #${tokenId} while indexing`);
            
            // 觸發按需預熱（僅對重要類型）
            if (PREHEAT_CONFIG.onDemandEnabled && PREHEAT_CONFIG.priorityTypes.includes(type)) {
              setTimeout(() => {
                triggerOnDemandPreheat(type, tokenId);
              }, PREHEAT_CONFIG.onDemandDelay);
            }
          }
          
          // 如果還是沒有數據，返回占位符
          if (!nftData) {
            console.log(`No data found for ${type} #${tokenId}, returning placeholder`);
            
            // 觸發按需預熱（僅對重要類型）
            if (PREHEAT_CONFIG.onDemandEnabled && PREHEAT_CONFIG.priorityTypes.includes(type)) {
              setTimeout(() => {
                triggerOnDemandPreheat(type, tokenId);
              }, PREHEAT_CONFIG.onDemandDelay);
            }
            
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
              // 對於無法確定稀有度的情況，使用稀有度 1 的圖片作為預設
              const defaultRarity = 1;
              const defaultImageUrl = type === 'party' 
                ? `${FRONTEND_DOMAIN}/images/party/party.png`
                : `${FRONTEND_DOMAIN}/images/${type}/${type}-${defaultRarity}.png`;
              
              nftData = {
                name: `${type.charAt(0).toUpperCase() + type.slice(1)} #${tokenId}`,
                description: "This NFT's data is currently unavailable. Please try again later.",
                image: defaultImageUrl,
                attributes: [
                  { trait_type: "Status", value: "Loading" },
                  { trait_type: "Token ID", value: parseInt(tokenId), display_type: "number" },
                  { 
                    trait_type: "Rarity", 
                    value: defaultRarity,
                    display_type: "number",
                    max_value: 5,
                    note: "Default value - actual rarity pending"
                  }
                ],
                tokenId: tokenId.toString(),
                metadata_status: "pending",
                retry_after: 10
              };
            }
          }
        }
        
        // 動態快取策略
        if (nftData) {
          if (nftData.indexing) {
            // 正在索引的 NFT 使用短期緩存
            cache.set(cacheKey, nftData, CACHE_TTL.indexing);
            console.log(`Caching indexing NFT ${type} #${tokenId} for ${CACHE_TTL.indexing/60} minutes`);
          } else if (nftData.source === 'placeholder') {
            // 占位符使用短期緩存
            cache.set(cacheKey, nftData, CACHE_TTL.placeholder);
            console.log(`Caching placeholder ${type} #${tokenId} for ${CACHE_TTL.placeholder/60} minutes`);
          } else if (nftData.source === 'subgraph' || nftData.source === 'preheated') {
            // 使用統一的 TTL 策略，根據 NFT 類型決定緩存時間
            const ttl = CACHE_TTL[type] || CACHE_TTL.hero; // 默認使用 hero 的 TTL
            // 簡化的緩存策略：直接根據 NFT 類型使用統一 TTL
            cache.set(cacheKey, nftData, ttl);
            console.log(`Caching complete NFT ${type} #${tokenId} for ${ttl/3600} hours`);
          } else {
            // 其他數據使用預設 TTL
            cache.set(cacheKey, nftData, ttl);
            console.log(`Caching NFT ${type} #${tokenId} for ${ttl/3600} hours`);
          }
        }
        
        // 設置響應頭，告訴 NFT 市場何時應該重新請求
        if (nftData) {
          if (nftData.indexing || nftData.source === 'placeholder') {
            // 正在索引或占位符：建議 2 分鐘後重試（符合子圖索引時間）
            res.set('Cache-Control', 'public, max-age=120');
            res.set('X-Refresh-After', '120');
          } else if (nftData.source === 'subgraph' || nftData.source === 'preheated') {
            // 特殊處理經常更新的 NFT 類型
            if (type === 'playerprofile') {
              // 玩家檔案：經驗值經常更新，使用短快取
              res.set('Cache-Control', 'public, max-age=300'); // 5 分鐘
              res.set('X-Cache-Level', 'dynamic-profile');
              res.set('X-Update-Frequency', 'frequent');
            } else if (type === 'vip' || type === 'vipstaking') {
              // VIP：等級會變化但不頻繁，使用中等快取
              res.set('Cache-Control', 'public, max-age=1800'); // 30 分鐘
              res.set('X-Cache-Level', 'dynamic-vip');
              res.set('X-Update-Frequency', 'moderate');
            } else {
              // 其他 NFT（Hero、Relic、Party）：屬性固定，使用智能快取
              // 基於 Token ID 和非線性鑄造模式的智能估算
              const tokenIdNum = parseInt(tokenId);
              
              // 🎯 調整為十倍鑄造量的年齡估算
              let estimatedAge;
              if (tokenIdNum <= 1000) {
                // 前 1000 個：假設首日爆發（幾千個/天）
                estimatedAge = Math.max(90, 90 + tokenIdNum / 100); // 至少 90 天前，越早的 ID 越老
              } else if (tokenIdNum <= 5000) {
                // 1001-5000：假設首週內高峰鑄造（每天 1000-2000 個）
                estimatedAge = Math.max(60, 90 - (tokenIdNum - 1000) / 100); // 60-90 天前
              } else if (tokenIdNum <= 20000) {
                // 5001-20000：假設首月內穩定鑄造（每天 500-1000 個）
                estimatedAge = Math.max(30, 60 - (tokenIdNum - 5000) / 500); // 30-60 天前
              } else if (tokenIdNum <= 50000) {
                // 20001-50000：假設低量期（每天 100-500 個）
                estimatedAge = Math.max(7, 30 - (tokenIdNum - 20000) / 1000); // 7-30 天前
              } else {
                // 50000+：假設極低量期（每天 10-100 個）
                estimatedAge = Math.max(0, 7 - (tokenIdNum - 50000) / 100); // 0-7 天前
              }
            
              // 安全邊界檢查
              estimatedAge = Math.max(0, estimatedAge);
              
              const isVeryOldNft = tokenIdNum <= 1000;    // 前 1000 個（傳奇級）
              const isOldNft = tokenIdNum <= 5000;        // 前 5000 個（早期）
              const isAncientNft = estimatedAge > 90;     // 超過 3 個月
              const isMatureNft = estimatedAge > 30;      // 超過 1 個月
              
              let cacheSeconds, cacheLevel;
              
              if (isVeryOldNft && isAncientNft) {
                // 古老傳奇 NFT：24 小時緩存（從 1 年縮短）
                cacheSeconds = 86400; // 24 小時
                cacheLevel = `legendary-${Math.floor(estimatedAge)}d-id${tokenIdNum}`;
              } else if (isAncientNft) {
                // 古老 NFT：12 小時緩存（從 6 個月縮短）
                cacheSeconds = 43200; // 12 小時
                cacheLevel = `ancient-${Math.floor(estimatedAge)}d-id${tokenIdNum}`;
              } else if (isVeryOldNft && isMatureNft) {
                // 早期成熟 NFT：6 小時緩存（從 30 天縮短）
                cacheSeconds = 21600; // 6 小時
                cacheLevel = `early-mature-${Math.floor(estimatedAge)}d-id${tokenIdNum}`;
              } else if (isMatureNft) {
                // 成熟 NFT：4 小時緩存（從 7 天縮短）
                cacheSeconds = 14400; // 4 小時
                cacheLevel = `mature-${Math.floor(estimatedAge)}d-id${tokenIdNum}`;
              } else if (estimatedAge > 7) {
                // 一週以上：2 小時緩存（從 24 小時縮短）
                cacheSeconds = 7200; // 2 小時
                cacheLevel = `week-old-${Math.floor(estimatedAge)}d-id${tokenIdNum}`;
              } else if (estimatedAge > 1) {
                // 一天以上：1 小時緩存（從 4 小時縮短）
                cacheSeconds = 3600; // 1 小時
                cacheLevel = `day-old-${Math.floor(estimatedAge)}d-id${tokenIdNum}`;
              } else {
                // 新鑄造：10 分鐘緩存（從 30 分鐘縮短）
                cacheSeconds = 600; // 10 分鐘
                cacheLevel = `fresh-${Math.floor(estimatedAge * 24)}h-id${tokenIdNum}`;
              }
              
              res.set('Cache-Control', `public, max-age=${cacheSeconds}`);
              res.set('X-Cache-Level', cacheLevel);
              res.set('X-NFT-Age-Days-Estimated', Math.floor(estimatedAge).toString());
              res.set('X-Age-Source', 'token-id-based-estimation');
            }
          } else {
            // 其他數據：標準緩存
            res.set('Cache-Control', 'public, max-age=600');
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
            // 對於隊伍，嘗試從 metadata 屬性中獲取 totalPower
            let totalPower = null;
            if (type === 'party' && metadata.attributes) {
              const powerAttr = metadata.attributes.find(attr => attr.trait_type === 'Total Power');
              if (powerAttr) {
                totalPower = parseInt(powerAttr.value);
              }
            }
            
            // 更新 token ID 相關信息 - 使用增強的名稱格式
            metadata.name = generateEnhancedNFTName(type, tokenId, rarity, totalPower);
            // Party 使用基於戰力的圖片
            metadata.image = type === 'party' && totalPower 
              ? getPartyImageByPower(totalPower)
              : `${FRONTEND_DOMAIN}/images/${type}/${type}-${rarityIndex}.png`;
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
        
        // 移除熱門 NFT 特殊處理以簡化架構
        
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
        ...data.globalStats,
        source: 'subgraph',
        timestamp: new Date().toISOString()
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
// 熱門 NFT 端點已移除以簡化架構
// app.get('/api/hot/:type', ...) - 已移除

// 清除快取端點（僅開發環境）
if (process.env.NODE_ENV === 'development') {
  app.post('/api/cache/clear', (req, res) => {
    cache.flushAll();
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
// 批量查詢 API - 為 NFT 市場優化
app.post('/api/batch', async (req, res) => {
  try {
    const { requests } = req.body;
    
    // 驗證請求格式
    if (!Array.isArray(requests) || requests.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid request format',
        message: 'requests should be a non-empty array'
      });
    }
    
    // 限制批量大小（防止濫用）
    const maxBatchSize = 100;
    if (requests.length > maxBatchSize) {
      return res.status(400).json({ 
        error: 'Batch size too large',
        message: `Maximum batch size is ${maxBatchSize}, got ${requests.length}`
      });
    }
    
    console.log(`🔄 批量查詢請求: ${requests.length} 個 NFT`);
    
    // 批量處理請求
    const batchResults = await Promise.allSettled(
      requests.map(async (request, index) => {
        const { type, tokenId } = request;
        
        // 驗證單個請求
        if (!type || !tokenId) {
          throw new Error(`Invalid request at index ${index}: missing type or tokenId`);
        }
        
        if (!['hero', 'relic', 'party', 'vip'].includes(type)) {
          throw new Error(`Invalid NFT type at index ${index}: ${type}`);
        }
        
        // 重用現有的 API 邏輯
        const cacheKey = generateCacheKey(`${type}-${tokenId}`, {});
        let nftData = cache.get(cacheKey);
        
        if (!nftData) {
          // 嘗試從子圖獲取資料
          if (['hero', 'relic', 'party'].includes(type)) {
            const contractAddress = CONTRACTS[type];
            const nftId = `${contractAddress.toLowerCase()}-${tokenId}`;
            const data = await queryGraphQL(GRAPHQL_QUERIES.getNftById, { nftId });
            
            const nft = data[type];
            if (nft) {
              const rarity = nft.rarity || nft.partyRarity || 1;
              const rarityIndex = Math.max(1, Math.min(5, rarity));
              
              const imageUrl = type === 'party' 
                ? getPartyImageByPower(nft.totalPower)
                : `${FRONTEND_DOMAIN}/images/${type}/${type}-${rarityIndex}.png`;
              
              nftData = {
                name: generateEnhancedNFTName(type, tokenId, rarity, type === 'party' ? nft.totalPower : null),
                description: 'Dungeon Delvers NFT - 批量查詢',
                image: imageUrl,
                attributes: [
                  { trait_type: 'Token ID', value: parseInt(tokenId), display_type: 'number' },
                  { 
                    trait_type: 'Rarity', 
                    value: rarity,
                    display_type: 'number',
                    max_value: 5
                  },
                  ...(type === 'hero' ? [
                    { 
                      trait_type: 'Power', 
                      value: parseInt(nft.power),
                      display_type: 'number',
                      max_value: 255
                    }
                  ] : type === 'relic' ? [
                    { 
                      trait_type: 'Capacity', 
                      value: parseInt(nft.capacity),
                      display_type: 'number',
                      max_value: 5
                    }
                  ] : type === 'party' ? [
                    { 
                      trait_type: 'Total Power', 
                      value: parseInt(nft.totalPower),
                      display_type: 'number',
                      max_value: 2820
                    },
                    { 
                      trait_type: 'Total Capacity', 
                      value: parseInt(nft.totalCapacity),
                      display_type: 'number',
                      max_value: 25
                    }
                  ] : [])
                ],
                source: 'batch-subgraph',
                type,
                tokenId: tokenId.toString()
              };
              
              // 智能緩存
              const tokenIdNum = parseInt(tokenId);
              let cacheTime = 600; // 預設 10 分鐘
              
              if (tokenIdNum <= 1000) {
                cacheTime = 86400; // 24 小時
              } else if (tokenIdNum <= 5000) {
                cacheTime = 7200;  // 2 小時
              } else if (tokenIdNum <= 20000) {
                cacheTime = 3600;  // 1 小時
              }
              
              cache.set(cacheKey, nftData, cacheTime);
            }
          }
          
          // 如果沒有從子圖獲取到數據，生成 fallback
          if (!nftData) {
            nftData = await generateFallbackMetadata(type, tokenId);
          }
        }
        
        return {
          type,
          tokenId,
          success: true,
          data: nftData
        };
      })
    );
    
    // 處理結果
    const results = batchResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          type: requests[index]?.type || 'unknown',
          tokenId: requests[index]?.tokenId || 'unknown',
          success: false,
          error: result.reason?.message || 'Unknown error'
        };
      }
    });
    
    // 統計結果
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;
    
    console.log(`✅ 批量查詢完成: ${successCount} 成功, ${failureCount} 失敗`);
    
    // 設置適當的緩存頭
    res.set('Cache-Control', 'public, max-age=300'); // 5 分鐘緩存
    res.set('X-Batch-Size', results.length.toString());
    res.set('X-Success-Count', successCount.toString());
    res.set('X-Failure-Count', failureCount.toString());
    
    res.json({
      success: true,
      total: results.length,
      successful: successCount,
      failed: failureCount,
      results
    });
    
  } catch (error) {
    console.error('❌ 批量查詢錯誤:', error);
    res.status(500).json({
      success: false,
      error: 'Batch query failed',
      message: error.message
    });
  }
});

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
    // 熱門緩存已移除
    
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

// Collection metadata endpoint
app.get('/api/collection/:type', (req, res) => {
  const { type } = req.params;
  
  const collections = {
    hero: {
      name: 'Dungeon Delvers Heroes',
      description: 'Heroes are the core combat power of the adventure team in Dungeon Delvers. Each hero is a unique NFT with randomly generated power on the chain, ready to venture into the darkest dungeons.',
      image: `${FRONTEND_DOMAIN}/images/collections/hero-logo.png`,
      external_link: FRONTEND_DOMAIN,
      seller_fee_basis_points: 500,
      fee_recipient: '0x10925A7138649C7E1794CE646182eeb5BF8ba647'
    },
    relic: {
      name: 'Dungeon Delvers Relics',
      description: 'Mystical relics that provide additional capacity for your parties. Each relic enhances your team\'s ability to carry treasures from the dungeons.',
      image: `${FRONTEND_DOMAIN}/images/collections/relic-logo.png`,
      external_link: FRONTEND_DOMAIN,
      seller_fee_basis_points: 500,
      fee_recipient: '0x10925A7138649C7E1794CE646182eeb5BF8ba647'
    },
    party: {
      name: 'Dungeon Delvers Parties',
      description: 'A composite NFT representing a full team of heroes and relics, bundled together and ready for adventure. Parties are the main unit for undertaking expeditions.',
      image: `${FRONTEND_DOMAIN}/images/collections/party-logo.png`,
      external_link: FRONTEND_DOMAIN,
      seller_fee_basis_points: 500,
      fee_recipient: '0x10925A7138649C7E1794CE646182eeb5BF8ba647'
    },
    vip: {
      name: 'Dungeon Delvers VIP Pass',
      description: 'Exclusive VIP membership with staking benefits. The more you stake, the higher your VIP level and the greater your rewards.',
      image: `${FRONTEND_DOMAIN}/images/collections/vip-logo.png`,
      external_link: FRONTEND_DOMAIN,
      seller_fee_basis_points: 500,
      fee_recipient: '0x10925A7138649C7E1794CE646182eeb5BF8ba647'
    },
    vipstaking: {
      name: 'Dungeon Delvers VIP Pass',
      description: 'Exclusive VIP membership with staking benefits. The more you stake, the higher your VIP level and the greater your rewards.',
      image: `${FRONTEND_DOMAIN}/images/collections/vip-logo.png`,
      external_link: FRONTEND_DOMAIN,
      seller_fee_basis_points: 500,
      fee_recipient: '0x10925A7138649C7E1794CE646182eeb5BF8ba647'
    },
    playerprofile: {
      name: 'Dungeon Delvers Profile',
      description: 'Soul-bound achievement NFT tracking your journey through the dungeons. Your profile records your experience and accomplishments.',
      image: `${FRONTEND_DOMAIN}/images/collections/profile-logo.png`,
      external_link: FRONTEND_DOMAIN,
      seller_fee_basis_points: 0, // Soul-bound, no trading
      fee_recipient: '0x10925A7138649C7E1794CE646182eeb5BF8ba647'
    }
  };
  
  const collection = collections[type];
  if (!collection) {
    return res.status(404).json({ error: 'Collection not found' });
  }
  
  // Add contract address
  collection.contract_address = CONTRACTS[type];
  
  // Set cache headers for collection metadata
  res.set('Cache-Control', 'public, max-age=86400'); // 24 hours
  res.json(collection);
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
      'GET /api/collection/:type',
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

// 突發鑄造檢測狀態
let burstDetectionState = {
  recentMints: [], // 最近的鑄造記錄
  inBurstMode: false,
  burstModeStartTime: null,
  lastBurstCheck: Date.now()
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
    // 突發鑄造檢測與動態配置
    const isBurstMode = detectBurstMinting(recentNFTs);
    const processingConfig = getCurrentProcessingConfig();
    
    console.log(`🔄 處理 ${recentNFTs.length} 個新 NFT`);
    console.log(`⚙️ 模式: ${isBurstMode ? '🚨 突發處理' : '📊 正常處理'}`);
    console.log(`⚙️ 並發數: ${processingConfig.concurrency}, 批次: ${processingConfig.batchSize}, 延遲: ${processingConfig.batchDelay}ms`);

    // 分批處理 - 使用動態批次大小
    const batches = [];
    for (let i = 0; i < recentNFTs.length; i += processingConfig.batchSize) {
      batches.push(recentNFTs.slice(i, i + processingConfig.batchSize));
    }

    let totalProcessed = 0;
    let totalFailed = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`📦 處理批次 ${batchIndex + 1}/${batches.length} (${batch.length} 個 NFT)`);

      // 檢查 RPC 速率限制
      if (!checkRpcRateLimit()) {
        console.warn('⚠️ RPC 速率限制，等待 10 秒...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        continue;
      }

      // 使用 GraphQL 批量查詢優化性能
      const batchResults = await preheatBatchWithGraphQL(batch);
      
      // 統計結果
      batchResults.forEach(result => {
        if (result.success) {
          totalProcessed++;
          console.log(`✅ 預熱成功: ${result.type} #${result.tokenId}`);
        } else {
          totalFailed++;
          console.warn(`❌ 預熱失敗: ${result.type} #${result.tokenId}: ${result.error}`);
        }
      });

      // 批次間延遲 - 使用動態配置
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, processingConfig.batchDelay));
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

// GraphQL 批量預熱函數 - 性能優化版本
async function preheatBatchWithGraphQL(nftBatch) {
  console.log(`🚀 [GraphQL Batch Preheat] 開始批量預熱 ${nftBatch.length} 個 NFT`);
  
  try {
    // 將 NFT 按類型分組
    const nftIdsByType = { hero: [], relic: [], party: [] };
    const nftMap = new Map();
    
    nftBatch.forEach(nft => {
      const nftId = `${nft.contractAddress.toLowerCase()}-${nft.tokenId}`;
      nftIdsByType[nft.type].push(nftId);
      nftMap.set(nftId, nft);
    });

    // 收集所有需要查詢的 NFT IDs
    const allNftIds = [...nftIdsByType.hero, ...nftIdsByType.relic, ...nftIdsByType.party];
    
    if (allNftIds.length === 0) {
      return [];
    }

    // 執行批量 GraphQL 查詢
    const graphqlResults = await queryGraphQLBatch(allNftIds, 15); // 較小的批量大小避免超時
    
    // 處理每個 NFT
    const results = [];
    
    for (const nft of nftBatch) {
      const nftId = `${nft.contractAddress.toLowerCase()}-${nft.tokenId}`;
      
      try {
        let rarity = null;
        let metadata = null;
        
        // 首先嘗試從 GraphQL 結果獲取稀有度
        const graphqlData = graphqlResults[nftId];
        if (graphqlData && graphqlData.data) {
          if (nft.type === 'hero' && graphqlData.data.rarity) {
            rarity = graphqlData.data.rarity;
          } else if (nft.type === 'relic' && graphqlData.data.rarity) {
            rarity = graphqlData.data.rarity;
          } else if (nft.type === 'party' && graphqlData.data.partyRarity) {
            rarity = graphqlData.data.partyRarity;
          }
        }
        
        // 如果 GraphQL 沒有稀有度，回退到合約查詢
        if (!rarity) {
          console.log(`⚠️ [GraphQL Batch] ${nft.type} #${nft.tokenId} 稀有度缺失，回退到合約查詢`);
          recordRpcCall();
          rarity = await getRarityFromContract(nft.type, nft.tokenId);
        }
        
        if (rarity) {
          metadata = await generateMetadata(nft.type, nft.tokenId, rarity);
          const cacheKey = generateCacheKey(`${nft.type}-${nft.tokenId}`, {});
          
          // 根據 NFT 年齡決定緩存時間
          const nftAge = Date.now() - nft.createdAt;
          const isNewNFT = nftAge < (30 * 24 * 60 * 60 * 1000); // 30 天內算新 NFT
          
          const cacheTime = isNewNFT ? PREHEAT_CONFIG.newNftCacheTTL : PREHEAT_CONFIG.permanentCacheTTL;
          
          cache.set(cacheKey, {
            ...metadata,
            cached: Date.now(),
            source: 'preheated-batch',
            permanent: !isNewNFT
          }, cacheTime);
          
          results.push({
            success: true,
            type: nft.type,
            tokenId: nft.tokenId,
            rarity,
            cached: true
          });
        } else {
          results.push({
            success: false,
            type: nft.type,
            tokenId: nft.tokenId,
            error: '無法獲取稀有度'
          });
        }
        
      } catch (error) {
        console.error(`❌ [GraphQL Batch] ${nft.type} #${nft.tokenId} 處理失敗:`, error.message);
        results.push({
          success: false,
          type: nft.type,
          tokenId: nft.tokenId,
          error: error.message
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`🎯 [GraphQL Batch Preheat] 完成: ${successCount}/${nftBatch.length} 成功`);
    
    return results;
    
  } catch (error) {
    console.error(`💥 [GraphQL Batch Preheat] 批量預熱失敗:`, error.message);
    
    // 錯誤時回退到單個處理
    console.log(`🔄 [GraphQL Batch Preheat] 回退到單個處理模式`);
    const fallbackResults = [];
    
    for (const nft of nftBatch) {
      try {
        const success = await preheatSingleNFT(nft);
        fallbackResults.push({
          success,
          type: nft.type,
          tokenId: nft.tokenId,
          error: success ? null : '單個處理也失敗'
        });
      } catch (fallbackError) {
        fallbackResults.push({
          success: false,
          type: nft.type,
          tokenId: nft.tokenId,
          error: fallbackError.message
        });
      }
    }
    
    return fallbackResults;
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
        // 熱門緩存已移除，統一使用主緩存
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

// 突發鑄造檢測
function detectBurstMinting(newNFTs) {
  if (!PREHEAT_CONFIG.burstDetection.enabled) return false;
  
  const now = Date.now();
  const config = PREHEAT_CONFIG.burstDetection;
  
  // 清理過期的鑄造記錄
  burstDetectionState.recentMints = burstDetectionState.recentMints.filter(
    mintTime => now - mintTime < config.timeWindow
  );
  
  // 添加新的鑄造記錄
  newNFTs.forEach(() => {
    burstDetectionState.recentMints.push(now);
  });
  
  // 檢查是否達到突發閾值
  const recentCount = burstDetectionState.recentMints.length;
  const shouldEnterBurst = recentCount >= config.threshold;
  
  // 檢查是否應該退出突發模式
  if (burstDetectionState.inBurstMode) {
    const burstDuration = now - burstDetectionState.burstModeStartTime;
    if (burstDuration > config.emergencyDuration && recentCount < config.threshold / 2) {
      burstDetectionState.inBurstMode = false;
      burstDetectionState.burstModeStartTime = null;
      console.log(`🚨➡️📊 退出突發模式: 最近${Math.floor(config.timeWindow/60000)}分鐘內只有${recentCount}個NFT`);
      return false;
    }
    return true;
  }
  
  // 檢查是否應該進入突發模式
  if (shouldEnterBurst && !burstDetectionState.inBurstMode) {
    burstDetectionState.inBurstMode = true;
    burstDetectionState.burstModeStartTime = now;
    console.log(`🚨 突發鑄造檢測: ${Math.floor(config.timeWindow/60000)}分鐘內發現${recentCount}個新NFT，啟動突發處理模式！`);
    console.log(`⚡ 並發數提升: ${PREHEAT_CONFIG.baseConcurrency} → ${config.emergencyConcurrency}`);
    console.log(`⚡ 延遲縮短: ${PREHEAT_CONFIG.batchDelay}ms → ${config.reducedDelay}ms`);
    return true;
  }
  
  return burstDetectionState.inBurstMode;
}

// 獲取當前應該使用的並發數和延遲
function getCurrentProcessingConfig() {
  if (burstDetectionState.inBurstMode) {
    return {
      concurrency: PREHEAT_CONFIG.burstDetection.emergencyConcurrency,
      batchDelay: PREHEAT_CONFIG.burstDetection.reducedDelay,
      batchSize: Math.min(PREHEAT_CONFIG.batchSize * 2, 10) // 突發時批次稍微增大
    };
  }
  
  return {
    concurrency: PREHEAT_CONFIG.baseConcurrency,
    batchDelay: PREHEAT_CONFIG.batchDelay,
    batchSize: PREHEAT_CONFIG.batchSize
  };
}

// 按需預熱單個 NFT
async function triggerOnDemandPreheat(type, tokenId) {
  try {
    console.log(`🎯 按需預熱: ${type} #${tokenId}`);
    
    // 檢查是否已經在緩存中
    const cacheKey = generateCacheKey(`${type}-${tokenId}`, {});
    if (cache.get(cacheKey)) {
      console.log(`⚡ ${type} #${tokenId} 已在緩存中，跳過預熱`);
      return;
    }
    
    // 檢查是否為跳過類型
    if (PREHEAT_CONFIG.skipTypes.includes(type)) {
      console.log(`⏭️ ${type} #${tokenId} 屬於跳過類型，不進行預熱`);
      return;
    }
    
    // 執行預熱
    const nft = {
      type,
      tokenId,
      createdAt: Date.now(), // 當前時間作為創建時間
      retries: 0
    };
    
    await preheatSingleNFT(nft);
    console.log(`✅ 按需預熱完成: ${type} #${tokenId}`);
    
  } catch (error) {
    console.error(`❌ 按需預熱失敗: ${type} #${tokenId}`, error.message);
  }
}

// 生成元數據的輔助函數
async function generateMetadata(type, tokenId, rarity) {
  const rarityIndex = Math.max(1, Math.min(5, rarity));
  
  // 嘗試從子圖獲取完整數據
  let additionalAttributes = [];
  let totalPower = null; // 用於隊伍名稱生成
  try {
    const contractAddress = CONTRACTS[type];
    const nftId = `${contractAddress.toLowerCase()}-${tokenId}`;
    const data = await queryGraphQL(GRAPHQL_QUERIES.getNftById, { nftId });
    
    if (data && data[type]) {
      const nft = data[type];
      
      if (type === 'hero' && nft.power) {
        additionalAttributes.push({
          trait_type: 'Power',
          value: parseInt(nft.power),
          display_type: 'number',
          max_value: 255
        });
      } else if (type === 'relic' && nft.capacity) {
        additionalAttributes.push({
          trait_type: 'Capacity',
          value: parseInt(nft.capacity),
          display_type: 'number',
          max_value: 5
        });
      } else if (type === 'party') {
        if (nft.totalPower) {
          totalPower = parseInt(nft.totalPower); // 保存總戰力
          additionalAttributes.push({
            trait_type: 'Total Power',
            value: totalPower,
            display_type: 'number',
            max_value: 2820
          });
        }
        if (nft.totalCapacity) {
          additionalAttributes.push({
            trait_type: 'Total Capacity',
            value: parseInt(nft.totalCapacity),
            display_type: 'number',
            max_value: 25
          });
        }
      }
    }
  } catch (error) {
    console.warn(`無法從子圖獲取 ${type} #${tokenId} 的額外屬性:`, error.message);
  }
  
  return {
    name: generateEnhancedNFTName(type, tokenId, rarity, totalPower),
    description: `Dungeon Delvers ${type} with rarity ${rarity}`,
    image: type === 'party' && totalPower 
      ? getPartyImageByPower(totalPower)
      : `${FRONTEND_DOMAIN}/images/${type}/${type}-${rarityIndex}.png`,
    attributes: [
      { trait_type: 'Token ID', value: parseInt(tokenId), display_type: 'number' },
      { 
        trait_type: 'Rarity', 
        value: rarity,
        display_type: 'number',
        max_value: 5
      },
      ...additionalAttributes,
      { trait_type: 'Data Source', value: 'Preheated' }
    ],
    tokenId: tokenId.toString(),
    source: 'preheated',
    metadata_status: additionalAttributes.length > 0 ? 'complete' : 'partial'
  };
}

// 啟動服務器
async function startServer() {
  // 初始化配置
  await initializeConfig();
  
  // 初始化 BSC provider
  try {
    provider = createProvider();
    console.log(`✅ BSC Provider 初始化成功`);
  } catch (error) {
    console.warn(`⚠️ BSC Provider 初始化失敗: ${error.message}`);
    console.warn(`VIP 等級讀取功能將在首次使用時初始化`);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Metadata Server v1.3.0 running on port ${PORT} 🎯 VIP Level Support`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`📊 Sync status: http://localhost:${PORT}/api/sync-status`);
    console.log(`🎮 NFT API: http://localhost:${PORT}/api/:type/:tokenId`);
    console.log(`🔄 Refresh API: http://localhost:${PORT}/api/:type/:tokenId/refresh`);
    console.log(`👤 Player assets: http://localhost:${PORT}/api/player/:owner/assets`);
    console.log(`📈 Stats: http://localhost:${PORT}/api/stats`);
    console.log(`🔥 Hot NFTs: http://localhost:${PORT}/api/hot/:type`);
    console.log(`📦 Batch API: http://localhost:${PORT}/api/batch (POST)`);
    console.log(`🎯 VIP Level API: http://localhost:${PORT}/api/vip/:tokenId?owner=ADDRESS`);
    console.log(`⚡ Static Files: http://localhost:${PORT}/api/static/health`);
    console.log(`📁 Reading JSON files from: ${JSON_BASE_PATH}`);
    console.log(`🌐 Using full HTTPS URLs for images: ${FRONTEND_DOMAIN}/images/`);
    console.log(`🔄 BSC Market integration: OKX (Primary marketplace for BSC NFTs)`);
    console.log(`⚡ Cache TTL: 60s (normal), 300s (hot NFTs), 24h (preheated)`);
    console.log(`🎯 Priority: OKX > Metadata Server (OKX is the only active BSC NFT marketplace)`);
    console.log(`⚙️ Dynamic Config: ${process.env.CONFIG_URL || 'https://dungeondelvers.xyz/config/v15.json'}`);
    
    // 優化後的預熱機制
    if (PREHEAT_CONFIG.enabled) {
      console.log(`🔥 NFT Preheat: Optimized mode - Every ${PREHEAT_CONFIG.interval/60000} minutes`);
      console.log(`📊 Normal: ${PREHEAT_CONFIG.baseConcurrency} concurrency, ${PREHEAT_CONFIG.batchDelay}ms delay`);
      console.log(`🚨 Burst: ${PREHEAT_CONFIG.burstDetection.emergencyConcurrency} concurrency, ${PREHEAT_CONFIG.burstDetection.reducedDelay}ms delay`);
      console.log(`⚡ Burst trigger: ${PREHEAT_CONFIG.burstDetection.threshold} NFTs in ${PREHEAT_CONFIG.burstDetection.timeWindow/60000} minutes`);
      console.log(`🔄 Max RPC calls: ${PREHEAT_CONFIG.maxRpcCallsPerMinute}/min (reduced from 200)`);
      
      // 延遲啟動，減少啟動負載
      setTimeout(() => preheatNewNFTs(true), 60000); // 60 秒後開始
      
      // 降低頻率的定期檢查
      setInterval(() => preheatNewNFTs(true), PREHEAT_CONFIG.interval);
      
      // 降低頻率的快速檢查
      setInterval(quickPreheatCheck, PREHEAT_CONFIG.quickInterval);
    } else {
      console.log(`⚡ Performance Mode: Preheat disabled, using on-demand caching only`);
    }
    
    // 初始化事件監聽器（靜態文件生成）
    if (provider && CONTRACTS) {
      try {
        const NFTEventListener = require('./eventListener');
        const eventListener = new NFTEventListener(provider, CONTRACTS, {
          enableEventListening: true,
          staticFileGeneration: true
        });
        
        // 延遲啟動事件監聽
        setTimeout(() => {
          eventListener.startListening().then(() => {
            console.log('🎧 NFT 事件監聽已啟動 - 將自動生成新鑄造 NFT 的靜態文件');
          }).catch(error => {
            console.warn('⚠️ NFT 事件監聽啟動失敗:', error.message);
          });
        }, 30000); // 30 秒後啟動事件監聽
        
      } catch (error) {
        console.warn('⚠️ 事件監聽器初始化失敗:', error.message);
      }
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
