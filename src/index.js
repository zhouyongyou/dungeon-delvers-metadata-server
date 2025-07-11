// index.js (API 路由修正版)

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import {
    publicClient,
    contractAddresses,
    abis,
    generateHeroSVG,
    generateRelicSVG,
    generatePartySVG,
    generateProfileSVG,
    generateVipSVG,
    withCache,
    graphClient,
    logger,
    heroLoader,
    relicLoader,
    partyLoader,
    cacheManager,
    performanceMetrics,
    redis
} from './utils.js';
import {
    GET_HERO_QUERY,
    GET_RELIC_QUERY,
    GET_PARTY_QUERY,
    GET_PLAYER_PROFILE_QUERY,
    GET_VIP_QUERY
} from './queries.js';
import { formatEther } from 'viem';

const app = express();
const PORT = process.env.PORT || 3001;

// 環境變數驗證
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

// 性能監控中間件
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

const allowedOrigins = ['https://www.dungeondelvers.xyz', 'http://localhost:5173'];
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

const handleRequest = (handler) => async (req, res) => {
    try {
        await handler(req, res);
    } catch (error) {
        // ★ 優化：捕捉到已知錯誤類型並回傳特定狀態碼
        if (error.message.includes('not found')) {
            console.warn(`[Not Found on ${req.path}]`, error.message);
            return res.status(404).json({ 
                error: 'Resource not found.',
                message: error.message 
            });
        }
        
        console.error(`[Error on ${req.path}]`, error);
        res.status(500).json({ 
            error: 'Failed to fetch token metadata.',
            message: error.message 
        });
    }
};

// --- Hero, Relic, Party 端點 (保持不變) ---
app.get('/api/hero/:tokenId', handleRequest(async (req, res) => {
    const { tokenId } = req.params;
    const cacheKey = `hero-${tokenId}`;
    const id = `${contractAddresses.hero.toLowerCase()}-${tokenId}`;

    const metadata = await withCache(cacheKey, async () => {
        // ★ 優化：使用 DataLoader 批量查詢
        const hero = await heroLoader.load(id);
        
        // ★ 優化：如果 The Graph 找不到資料，拋出特定錯誤
        if (!hero) throw new Error(`Hero #${tokenId} not found in The Graph`);

        const svgString = generateHeroSVG({ rarity: hero.rarity, power: BigInt(hero.power) }, BigInt(tokenId));
        const image_data = Buffer.from(svgString).toString('base64');
        return {
            name: `Dungeon Delvers Hero #${tokenId}`,
            description: "A brave hero from the world of Dungeon Delvers, ready for adventure.",
            image: `data:image/svg+xml;base64,${image_data}`,
            attributes: [ 
                { trait_type: "Rarity", value: hero.rarity }, 
                { trait_type: "Power", value: Number(hero.power) },
                { trait_type: "Created At", value: Number(hero.createdAt), display_type: "date" }
            ],
        };
    }, 'hero');
    res.json(metadata);
}));

app.get('/api/relic/:tokenId', handleRequest(async (req, res) => {
    const { tokenId } = req.params;
    const cacheKey = `relic-${tokenId}`;
    const id = `${contractAddresses.relic.toLowerCase()}-${tokenId}`;

    const metadata = await withCache(cacheKey, async () => {
        // ★ 優化：使用 DataLoader 批量查詢
        const relic = await relicLoader.load(id);
        
        // ★ 優化：如果 The Graph 找不到資料，拋出特定錯誤
        if (!relic) throw new Error(`Relic #${tokenId} not found in The Graph`);

        const svgString = generateRelicSVG(relic, BigInt(tokenId));
        const image_data = Buffer.from(svgString).toString('base64');
        return {
            name: `Dungeon Delvers Relic #${tokenId}`,
            description: "An ancient relic imbued with mysterious powers.",
            image: `data:image/svg+xml;base64,${image_data}`,
            attributes: [ 
                { trait_type: "Rarity", value: relic.rarity }, 
                { trait_type: "Capacity", value: relic.capacity },
                { trait_type: "Created At", value: Number(relic.createdAt), display_type: "date" }
            ],
        };
    }, 'relic');
    res.json(metadata);
}));

app.get('/api/party/:tokenId', handleRequest(async (req, res) => {
    const { tokenId } = req.params;
    const cacheKey = `party-${tokenId}`;
    const id = `${contractAddresses.party.toLowerCase()}-${tokenId}`;
    
    const metadata = await withCache(cacheKey, async () => {
        // ★ 優化：使用 DataLoader 批量查詢
        const party = await partyLoader.load(id);
        // ★ 優化：如果 The Graph 找不到資料，拋出特定錯誤
        if (!party) throw new Error(`Party #${tokenId} not found in The Graph`);
        
        const partyData = { 
            ...party, 
            heroIds: party.heros, 
            totalPower: BigInt(party.totalPower), 
            totalCapacity: BigInt(party.totalCapacity) 
        };
        const svgString = generatePartySVG(partyData, BigInt(tokenId));
        const image_data = Buffer.from(svgString).toString('base64');
        return {
            name: `Dungeon Delvers Party #${tokenId}`,
            description: "A brave party of delvers, united for a common goal.",
            image: `data:image/svg+xml;base64,${image_data}`,
            attributes: [ 
                { trait_type: "Total Power", value: Number(party.totalPower) }, 
                { trait_type: "Total Capacity", value: Number(party.totalCapacity) }, 
                { trait_type: "Party Rarity", value: party.partyRarity },
                { trait_type: "Heroes Count", value: party.heros.length },
                { trait_type: "Relics Count", value: party.relics.length },
                { trait_type: "Fatigue Level", value: party.fatigueLevel },
                { trait_type: "Provisions Remaining", value: party.provisionsRemaining },
                { trait_type: "Created At", value: Number(party.createdAt), display_type: "date" }
            ],
        };
    }, 'party');
    res.json(metadata);
}));


// --- Profile 和 VIP 端點 (已修正路由) ---

// ★ 核心修正：將路由改為 /api/playerprofile/

app.get('/api/playerprofile/:tokenId', handleRequest(async (req, res) => {
    const { tokenId } = req.params;
    const cacheKey = `playerprofile-${tokenId}`;

    const metadata = await withCache(cacheKey, async () => {
        const owner = await publicClient.readContract({
            address: contractAddresses.playerProfile,
            abi: abis.playerProfile,
            functionName: 'ownerOf',
            args: [BigInt(tokenId)],
        }).catch(() => {
            // ★ 優化：如果 ownerOf 失敗 (例如 token 不存在)，拋出錯誤
            throw new Error(`PlayerProfile #${tokenId} not found or has no owner.`);
        });

        const { player } = await graphClient.request(GET_PLAYER_PROFILE_QUERY, { playerId: owner.toLowerCase() });
        const profile = player?.profile;
        
        // ★ 優化：如果 The Graph 找不到資料，拋出特定錯誤
        if (!profile) throw new Error(`Profile data not found in The Graph for owner ${owner}`);

        const svgString = generateProfileSVG({ level: Number(profile.level), experience: BigInt(profile.experience) }, BigInt(tokenId));
        const image_data = Buffer.from(svgString).toString('base64');
        return {
            name: `Dungeon Delvers Profile #${tokenId}`,
            description: "A soul-bound achievement token for Dungeon Delvers.",
            image: `data:image/svg+xml;base64,${image_data}`,
            attributes: [
                { trait_type: "Level", value: Number(profile.level) },
                { display_type: "number", trait_type: "Experience", value: Number(profile.experience) },
            ],
        };
    });
    res.json(metadata);
}));

// ★ 核心修正：將路由改為 /api/vipstaking/

app.get('/api/vipstaking/:tokenId', handleRequest(async (req, res) => {
    const { tokenId } = req.params;
    const cacheKey = `vipstaking-${tokenId}`;

    const metadata = await withCache(cacheKey, async () => {
        const owner = await publicClient.readContract({
            address: contractAddresses.vipStaking,
            abi: abis.vipStaking,
            functionName: 'ownerOf',
            args: [BigInt(tokenId)],
        }).catch(() => {
            // ★ 優化：如果 ownerOf 失敗 (例如 token 不存在)，拋出錯誤
            throw new Error(`VIPStaking NFT #${tokenId} not found or has no owner.`);
        });

        const { player } = await graphClient.request(GET_VIP_QUERY, { playerId: owner.toLowerCase() });
        const vip = player?.vip;

        // ★ 優化：如果 The Graph 找不到資料，拋出特定錯誤
        if (!vip) throw new Error(`VIP data not found in The Graph for owner ${owner}`);

        // ★ 修正：從智能合約讀取實際的 VIP 等級，而不是依賴 GraphQL 數據
        const vipLevel = await publicClient.readContract({
            address: contractAddresses.vipStaking,
            abi: abis.vipStaking,
            functionName: 'getVipLevel',
            args: [owner]
        });

        const stakedValueUSD = await publicClient.readContract({
            address: contractAddresses.oracle,
            abi: abis.oracle,
            functionName: 'getAmountOut',
            args: [contractAddresses.soulShard, BigInt(vip.stakedAmount)]
        });

        const svgString = generateVipSVG({ level: Number(vipLevel), stakedValueUSD }, BigInt(tokenId));
        const image_data = Buffer.from(svgString).toString('base64');
        return {
            name: `Dungeon Delvers VIP #${tokenId}`,
            description: "A soul-bound VIP card that provides in-game bonuses based on the staked value.",
            image: `data:image/svg+xml;base64,${image_data}`,
            attributes: [
                { trait_type: "Level", value: Number(vipLevel) },
                { display_type: "number", trait_type: "Staked Value (USD)", value: Number(formatEther(stakedValueUSD)) },
            ],
        };
    });
    res.json(metadata);
}));

// ★ 優化：增強健康檢查端點
app.get('/health', async (req, res) => {
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    checks: {}
  };
  
  try {
    // GraphQL 健康檢查
    try {
      const testQuery = `query { _meta { block { number } } }`;
      await graphClient.request(testQuery);
      healthCheck.checks.graphql = { status: 'OK', responseTime: '< 1s' };
    } catch (error) {
      healthCheck.checks.graphql = { status: 'ERROR', error: error.message };
      healthCheck.status = 'degraded';
    }
    
    // Redis 健康檢查
    try {
      const pingResult = await redis.ping();
      healthCheck.checks.redis = { 
        status: pingResult === 'PONG' ? 'OK' : 'ERROR',
        responseTime: '< 100ms'
      };
    } catch (error) {
      healthCheck.checks.redis = { status: 'ERROR', error: error.message };
      healthCheck.status = 'degraded';
    }
    
    // 快取統計
    const cacheStats = await cacheManager.getCacheStats();
    healthCheck.checks.cache = { 
      status: 'OK', 
      hitRate: `${performanceMetrics.getCacheHitRate().toFixed(2)}%`,
      stats: cacheStats
    };
    
    // 性能指標
    healthCheck.performance = performanceMetrics.getMetrics();
    
    const statusCode = healthCheck.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthCheck);
  } catch (error) {
    healthCheck.status = 'unhealthy';
    healthCheck.error = error.message;
    res.status(503).json(healthCheck);
  }
});

// ★ 新增：快取管理端點
app.get('/admin/cache/stats', async (req, res) => {
  try {
    const stats = await cacheManager.getCacheStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/cache/clear', async (req, res) => {
  try {
    const { pattern = '*' } = req.body;
    await cacheManager.clearCache(pattern);
    res.json({ success: true, message: `Cache cleared for pattern: ${pattern}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/cache/preload', async (req, res) => {
  try {
    const { tokenIds, type } = req.body;
    if (!tokenIds || !type) {
      return res.status(400).json({ error: 'tokenIds and type are required' });
    }
    
    await cacheManager.preloadCache(tokenIds, type);
    res.json({ 
      success: true, 
      message: `Preload initiated for ${tokenIds.length} ${type} tokens` 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ★ 新增：性能指標端點
app.get('/admin/metrics', (req, res) => {
  const metrics = performanceMetrics.getMetrics();
  res.json(metrics);
});

const server = app.listen(PORT, () => {
  console.log(`Metadata server with cache and The Graph integration listening on port ${PORT}`);
});

// ★ 優化：Graceful shutdown with Redis cleanup
const gracefulShutdown = async (signal) => {
  console.log(`${signal} received, shutting down gracefully...`);
  
  // 停止接受新連接
  server.close(async () => {
    try {
      // 關閉 Redis 連接
      await redis.quit();
      console.log('Redis connection closed');
      
      // 清理 DataLoader 緩存
      heroLoader.clearAll();
      relicLoader.clearAll();
      partyLoader.clearAll();
      console.log('DataLoader cache cleared');
      
      console.log('Process terminated gracefully');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
  
  // 強制退出超時
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000); // 30秒超時
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
