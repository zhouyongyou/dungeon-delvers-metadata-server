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
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// =================================================================
// Section: 配置與中間件
// =================================================================

// 安全中間件
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// 速率限制
const rateLimiter = new RateLimiterMemory({
  keyGenerator: (req) => req.ip,
  points: 100, // 請求次數
  duration: 60, // 時間窗口（秒）
});

const rateLimiterMiddleware = (req, res, next) => {
  rateLimiter.consume(req.ip)
    .then(() => next())
    .catch(() => res.status(429).json({ error: 'Too many requests' }));
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

const THE_GRAPH_API_URL = process.env.THE_GRAPH_API_URL || 'https://api.studio.thegraph.com/query/115633/dungeon-delvers/v2.0.0-new-contracts';
const SUBGRAPH_ID = process.env.SUBGRAPH_ID || 'dungeon-delvers';

// JSON 文件路徑配置 - 指向主專案的 public/api
const JSON_BASE_PATH = path.join(__dirname, '../../../GitHub/DungeonDelvers/public/api');

// 前端域名配置 - 用於圖片 URL
const FRONTEND_DOMAIN = process.env.FRONTEND_DOMAIN || 'https://dungeondelvers.xyz';

// 測試模式：根據 tokenId 模擬稀有度（僅用於測試）
const TEST_MODE = process.env.TEST_MODE === 'true';

// 合約地址配置 - v1.3.0 更新後的地址（VIP 平方根修正版）
const CONTRACTS = {
  hero: process.env.VITE_MAINNET_HERO_ADDRESS || '0x929a4187a462314fCC480ff547019fA122A283f0',
  relic: process.env.VITE_MAINNET_RELIC_ADDRESS || '0x1067295025D21f59C8AcB5E777E42F3866a6D2fF',
  party: process.env.VITE_MAINNET_PARTY_ADDRESS || '0xE0272e1D76de1F789ce0996F3226bCf54a8c7735',
  vip: process.env.VITE_MAINNET_VIPSTAKING_ADDRESS || '0x7aBEA5b90528a19580A0a2A83e4CF9AD4871880F',
  playerprofile: process.env.VITE_MAINNET_PLAYERPROFILE_ADDRESS || '0xBba4fE0b9Ac0b16786986aF0F39535B37D09Ff1F'
};

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
  try {
    const response = await axios.post(THE_GRAPH_API_URL, {
      query,
      variables
    }, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DungeonDelvers-MetadataServer/1.3.0'
      }
    });
    
    if (response.data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
    }
    
    return response.data.data;
  } catch (error) {
    console.error('GraphQL query failed:', error.message);
    throw error;
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

// 生成 fallback metadata
function generateFallbackMetadata(type, tokenId, rarity = 1) {
  const baseData = {
    name: `${type.charAt(0).toUpperCase() + type.slice(1)} #${tokenId}`,
    description: '正在載入詳細資訊...',
    image: '',
    attributes: [],
    source: 'fallback'
  };
  
  const getImageByRarity = (type, rarity) => {
    // 處理未知稀有度的情況
    if (!rarity || rarity === 0) {
      return `${FRONTEND_DOMAIN}/images/${type}/${type}-placeholder.png`;
    }
    const rarityIndex = Math.max(1, Math.min(5, rarity));
    return `${FRONTEND_DOMAIN}/images/${type}/${type}-${rarityIndex}.png`;
  };
  
  switch (type) {
    case 'hero':
      return {
        ...baseData,
        name: `英雄 #${tokenId}`,
        image: getImageByRarity('hero', rarity),
        attributes: [
          { trait_type: 'Power', value: '載入中...' },
          { trait_type: 'Rarity', value: rarity || '載入中...' }
        ]
      };
    case 'relic':
      return {
        ...baseData,
        name: `聖物 #${tokenId}`,
        image: getImageByRarity('relic', rarity),
        attributes: [
          { trait_type: 'Capacity', value: '載入中...' },
          { trait_type: 'Rarity', value: rarity || '載入中...' }
        ]
      };
    case 'party':
      return {
        ...baseData,
        name: `隊伍 #${tokenId}`,
        image: `${FRONTEND_DOMAIN}/images/party/party.png`,
        attributes: [
          { trait_type: 'Total Power', value: '載入中...' },
          { trait_type: 'Heroes Count', value: '載入中...' },
          { trait_type: 'Rarity', value: rarity || '載入中...' }
        ]
      };
    case 'vip':
    case 'vipstaking':
      return {
        ...baseData,
        name: `VIP Pass #${tokenId}`,
        description: 'Exclusive VIP membership card for DungeonDelvers. Grants special privileges and reduced fees.',
        image: `${FRONTEND_DOMAIN}/images/vip/vip.png`,
        attributes: [
          { trait_type: 'Type', value: 'VIP Pass' },
          { trait_type: 'Status', value: 'Active' },
          { trait_type: 'Benefits', value: 'Fee Reduction' }
        ]
      };
    case 'playerprofile':
      return {
        ...baseData,
        name: `Player Profile #${tokenId}`,
        description: 'DungeonDelvers Player Profile NFT',
        image: `${FRONTEND_DOMAIN}/images/profile/profile.png`,
        attributes: [
          { trait_type: 'Type', value: 'Player Profile' },
          { trait_type: 'Status', value: 'Active' }
        ]
      };
    default:
      return baseData;
  }
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

// 從NFT市場獲取最新資料（BSC鏈優先）
async function fetchFromNFTMarket(type, tokenId, contractAddress) {
  // 按優先級嘗試不同的BSC市場
  const marketSources = [
    { name: 'okx', fetchFn: () => fetchFromOKX(type, tokenId, contractAddress) },
    { name: 'element', fetchFn: () => fetchFromElement(type, tokenId, contractAddress) },
    { name: 'opensea', fetchFn: () => fetchFromOpenSea(type, tokenId, contractAddress) },
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
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '1.3.0',
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
      marketPriority: ['okx', 'element', 'opensea']
    },
    contracts: CONTRACTS
  });
});

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
              name: `${type === 'hero' ? '英雄' : type === 'relic' ? '聖物' : '隊伍'} #${tokenId}`,
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
        
        // 如果 subgraph 沒有資料，嘗試從靜態 JSON 讀取
        if (!nftData) {
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
              }
            } catch (error) {
              console.warn(`無法從子圖獲取 ${type} 稀有度，使用默認值: ${error.message}`);
            }
          }
          
          // 根據稀有度選擇圖片 (1-5)
          const rarityIndex = Math.max(1, Math.min(5, rarity));
          const jsonPath = path.join(JSON_BASE_PATH, type, `${rarityIndex}.json`);
          
          let metadata = readJSONFile(jsonPath);
          
          if (!metadata) {
            console.warn(`${type} JSON not found for rarity ${rarityIndex}, using fallback`);
            metadata = generateFallbackMetadata(type, tokenId, rarity);
          } else {
            // 更新 token ID 相關信息
            metadata.name = `${metadata.name} #${tokenId}`;
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
        nftData = {
          ...generateFallbackMetadata(type, tokenId, parseInt(rarity) || 1),
          id: tokenId,
          contractAddress: CONTRACTS[type],
          type,
          source: 'fallback'
        };
      }
    }
    
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
app.get('/', (req, res) => {
  res.json({
    service: 'Dungeon Delvers Metadata Server',
    version: '1.3.0',
    description: 'Advanced metadata server with GraphQL integration and caching',
    endpoints: [
      'GET /health',
      'GET /api/sync-status',
      'GET /api/:type/:tokenId',
      'GET /api/player/:owner/assets',
      'GET /api/stats',
      'GET /api/hot/:type',
      'POST /api/cache/clear (dev only)'
    ]
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
  console.log(`🔄 BSC Market integration: ${Object.keys(NFT_MARKET_APIS).join(', ')}`);
  console.log(`⚡ Cache TTL: 60s (normal), 300s (hot NFTs)`);
  console.log(`🎯 Priority: OKX > Element > OpenSea > Metadata Server`);
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔧 Development mode: Local static files available at /images and /assets`);
  }
});

module.exports = app;
