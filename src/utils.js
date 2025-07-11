// utils.js (The Graph 終極優化版)
// 說明: 此版本全面改用 The Graph 作為主要數據來源，以實現最高的穩定性和效能。

import { createPublicClient, http, formatEther } from 'viem';
import { bsc } from 'viem/chains';
import NodeCache from 'node-cache';
import Redis from 'ioredis';
import DataLoader from 'dataloader';
import { GraphQLClient, gql } from 'graphql-request'; // ★ 新增：導入 GraphQL 工具
import {
  heroABI,
  relicABI,
  partyABI,
  playerProfileABI,
  vipStakingABI,
  oracleABI,
} from './abis.js';

// =======================================================
// Section 1: 客戶端與合約設定
// =======================================================

// Viem client 仍然需要，用於呼叫 Oracle 等少數即時數據
export const publicClient = createPublicClient({
  chain: bsc,
  transport: http(process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org/'),
});

// ★ 新增：The Graph 客戶端 (帶重試機制)
const THE_GRAPH_API_URL = process.env.VITE_THE_GRAPH_STUDIO_API_URL;
const baseGraphClient = new GraphQLClient(THE_GRAPH_API_URL);

// ★ 新增：Redis 客戶端配置
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 5000,
  // 斷線重連
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

// Redis 連接事件監聽
redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

redis.on('error', (err) => {
  logger.error('Redis connection error', err);
});

// 帶重試機制的 GraphQL 客戶端
export const graphClient = {
  async request(query, variables, maxRetries = 3) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await baseGraphClient.request(query, variables);
        if (i > 0) {
          logger.info('GraphQL request succeeded after retry', { 
            attempt: i + 1, 
            variables 
          });
        }
        return result;
      } catch (error) {
        lastError = error;
        logger.error(`GraphQL request failed (attempt ${i + 1}/${maxRetries})`, error, { 
          query: query.definitions?.[0]?.name?.value || 'unknown',
          variables 
        });
        
        if (i < maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, i), 5000); // 指數退避，最大5秒
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }
};

export const contractAddresses = {
    hero: process.env.VITE_MAINNET_HERO_ADDRESS,
    relic: process.env.VITE_MAINNET_RELIC_ADDRESS,
    party: process.env.VITE_MAINNET_PARTY_ADDRESS,
    playerProfile: process.env.VITE_MAINNET_PLAYERPROFILE_ADDRESS,
    vipStaking: process.env.VITE_MAINNET_VIPSTAKING_ADDRESS,
    oracle: process.env.VITE_MAINNET_ORACLE_ADDRESS,
    soulShard: process.env.VITE_MAINNET_SOUL_SHARD_TOKEN_ADDRESS,
};

export const abis = {
    hero: heroABI,
    relic: relicABI,
    party: partyABI,
    playerProfile: playerProfileABI,
    vipStaking: vipStakingABI,
    oracle: oracleABI,
};

// =======================================================
// Section 2: 分層快取設定 (優化版)
// =======================================================
const cacheConfigs = {
  hero: { ttl: 3600, checkperiod: 600 },      // 1小時 - 相對靜態
  relic: { ttl: 3600, checkperiod: 600 },     // 1小時 - 相對靜態
  party: { ttl: 1800, checkperiod: 300 },     // 30分鐘 - 中等動態
  profile: { ttl: 300, checkperiod: 60 },     // 5分鐘 - 高動態
  vip: { ttl: 600, checkperiod: 120 }         // 10分鐘 - 中等動態
};

const caches = {};
Object.keys(cacheConfigs).forEach(type => {
  caches[type] = new NodeCache(cacheConfigs[type]);
});

// 結構化日誌工具
const logger = {
  info: (message, meta = {}) => {
    console.log(JSON.stringify({
      level: 'info',
      message,
      meta,
      timestamp: new Date().toISOString()
    }));
  },
  error: (message, error, meta = {}) => {
    console.error(JSON.stringify({
      level: 'error',
      message,
      error: error?.message || error,
      stack: error?.stack,
      meta,
      timestamp: new Date().toISOString()
    }));
  }
};

// 導出 logger 供其他模組使用
export { logger };

// ★ 新增：DataLoader 實現批量查詢
const createDataLoader = (queryFn, keyField = 'id') => {
  return new DataLoader(async (keys) => {
    try {
      const results = await queryFn(keys);
      return keys.map(key => results.find(item => item[keyField] === key) || null);
    } catch (error) {
      logger.error('DataLoader batch query failed', error, { keys });
      // 返回 null 數組而不是拋出錯誤，避免整個批次失敗
      return keys.map(() => null);
    }
  }, {
    maxBatchSize: 100,
    cacheKeyFn: (key) => String(key),
    // 啟用緩存
    cache: true
  });
};

// 批量查詢實現
const batchHeroQuery = async (ids) => {
  const query = gql`
    query GetHeroes($ids: [ID!]!) {
      heros(where: { id_in: $ids }) {
        id
        tokenId
        power
        rarity
        contractAddress
        createdAt
        owner { id }
      }
    }
  `;
  const { heros } = await graphClient.request(query, { ids });
  return heros;
};

const batchRelicQuery = async (ids) => {
  const query = gql`
    query GetRelics($ids: [ID!]!) {
      relics(where: { id_in: $ids }) {
        id
        tokenId
        capacity
        rarity
        contractAddress
        createdAt
        owner { id }
      }
    }
  `;
  const { relics } = await graphClient.request(query, { ids });
  return relics;
};

const batchPartyQuery = async (ids) => {
  const query = gql`
    query GetParties($ids: [ID!]!) {
      parties(where: { id_in: $ids }) {
        id
        tokenId
        totalPower
        totalCapacity
        partyRarity
        contractAddress
        heroes { tokenId power rarity }
        relics { tokenId capacity rarity }
        fatigueLevel
        provisionsRemaining
        cooldownEndsAt
        unclaimedRewards
        createdAt
        owner { id }
      }
    }
  `;
  const { parties } = await graphClient.request(query, { ids });
  return parties;
};

// 創建 DataLoader 實例
export const heroLoader = createDataLoader(batchHeroQuery);
export const relicLoader = createDataLoader(batchRelicQuery);
export const partyLoader = createDataLoader(batchPartyQuery);

// 已移除 SVG 模板緩存和生成邏輯

// ★ 新增：性能監控指標
const performanceMetrics = {
  requestCount: 0,
  cacheHits: 0,
  cacheMisses: 0,
  graphqlQueries: 0,
  staticImageGenerations: 0,
  averageResponseTime: 0,
  totalResponseTime: 0,
  
  // 更新方法
  recordRequest: (duration) => {
    performanceMetrics.requestCount++;
    performanceMetrics.totalResponseTime += duration;
    performanceMetrics.averageResponseTime = 
      performanceMetrics.totalResponseTime / performanceMetrics.requestCount;
  },
  
  recordCacheHit: () => {
    performanceMetrics.cacheHits++;
  },
  
  recordCacheMiss: () => {
    performanceMetrics.cacheMisses++;
  },
  
  getCacheHitRate: () => {
    const total = performanceMetrics.cacheHits + performanceMetrics.cacheMisses;
    return total > 0 ? (performanceMetrics.cacheHits / total) * 100 : 0;
  },
  
  getMetrics: () => ({ ...performanceMetrics })
};

export { performanceMetrics };

// 降級策略 - 當 GraphQL 失敗時返回基本元數據
export const fallbackMetadata = (tokenId, type) => {
  const typeConfig = {
    hero: { name: 'Hero', description: 'A brave hero from the world of Dungeon Delvers.', image: 'https://dungeondelvers.xyz/images/hero/hero-1.png' },
    relic: { name: 'Relic', description: 'An ancient relic imbued with mysterious powers.', image: 'https://dungeondelvers.xyz/images/relic/relic-1.png' },
    party: { name: 'Party', description: 'A brave party of delvers, united for a common goal.', image: 'https://dungeondelvers.xyz/images/party/party.png' },
    profile: { name: 'Profile', description: 'A soul-bound achievement token for Dungeon Delvers.', image: 'https://dungeondelvers.xyz/assets/images/collections/profile-logo.png' },
    vip: { name: 'VIP', description: 'A soul-bound VIP card that provides in-game bonuses.', image: 'https://dungeondelvers.xyz/images/vip-placeholder.png' }
  };
  
  const config = typeConfig[type] || typeConfig.hero;
  
  return {
    name: `Dungeon Delvers ${config.name} #${tokenId}`,
    description: config.description,
    image: config.image,
    attributes: [
      { trait_type: "Status", value: "Temporarily Unavailable" }
    ]
  };
};

// ★ 優化：混合緩存策略 (Redis + 本地緩存)
export const withCache = async (key, generator, type = 'hero') => {
  const cache = caches[type] || caches.hero;
  const ttl = cacheConfigs[type]?.ttl || 3600;
  
  // 1. 檢查本地緩存
  const localData = cache.get(key);
  if (localData) {
    performanceMetrics.recordCacheHit();
    logger.info('Local cache hit', { key, type });
    return localData;
  }
  
  // 2. 檢查 Redis 緩存
  try {
    const redisData = await redis.get(`cache:${key}`);
    if (redisData) {
      const parsedData = JSON.parse(redisData);
      // 存回本地緩存
      cache.set(key, parsedData);
      performanceMetrics.recordCacheHit();
      logger.info('Redis cache hit', { key, type });
      return parsedData;
    }
  } catch (error) {
    logger.error('Redis cache read failed', error, { key, type });
  }
  
  // 3. 緩存未命中，生成新數據
  performanceMetrics.recordCacheMiss();
  logger.info('Cache miss - generating new data', { key, type });
  const startTime = Date.now();
  
  try {
    const newData = await generator();
    
    // 存儲到本地緩存
    cache.set(key, newData);
    
    // 存儲到 Redis (異步，不阻塞響應)
    redis.setex(`cache:${key}`, ttl, JSON.stringify(newData)).catch(error => {
      logger.error('Redis cache write failed', error, { key, type });
    });
    
    const duration = Date.now() - startTime;
    performanceMetrics.recordRequest(duration);
    logger.info('Data generated successfully', { 
      key, 
      type, 
      duration 
    });
    
    return newData;
  } catch (error) {
    logger.error('Failed to generate data', error, { key, type });
    throw error;
  }
};

// ★ 新增：緩存管理函數
export const cacheManager = {
  // 清除特定緩存
  async clearCache(pattern) {
    try {
      const keys = await redis.keys(`cache:${pattern}`);
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.info('Cache cleared', { pattern, count: keys.length });
      }
    } catch (error) {
      logger.error('Cache clear failed', error, { pattern });
    }
  },
  
  // 預熱緩存
  async preloadCache(tokenIds, type) {
    const promises = tokenIds.map(async (tokenId) => {
      const key = `${type}-${tokenId}`;
      try {
        // 檢查是否已存在
        const exists = await redis.exists(`cache:${key}`);
        if (!exists) {
          // 觸發生成（但不等待）
          generateMetadata(tokenId, type).catch(error => {
            logger.error('Preload failed', error, { tokenId, type });
          });
        }
      } catch (error) {
        logger.error('Preload check failed', error, { tokenId, type });
      }
    });
    
    await Promise.allSettled(promises);
    logger.info('Cache preload initiated', { count: tokenIds.length, type });
  },
  
  // 獲取緩存統計
  async getCacheStats() {
    try {
      const info = await redis.info('memory');
      const keyCount = await redis.dbsize();
      
      return {
        redisMemoryUsage: info.match(/used_memory_human:(.+)/)?.[1]?.trim(),
        redisKeyCount: keyCount,
        localCacheStats: Object.keys(caches).reduce((acc, type) => {
          acc[type] = caches[type].getStats();
          return acc;
        }, {}),
        performanceMetrics: performanceMetrics.getMetrics()
      };
    } catch (error) {
      logger.error('Failed to get cache stats', error);
      return {
        error: 'Failed to fetch cache statistics',
        localCacheStats: Object.keys(caches).reduce((acc, type) => {
          acc[type] = caches[type].getStats();
          return acc;
        }, {}),
        performanceMetrics: performanceMetrics.getMetrics()
      };
    }
  }
};

// 導出 Redis 客戶端
export { redis };

// =======================================================
// Section 3: 已移除所有 SVG 生成邏輯
// =======================================================
