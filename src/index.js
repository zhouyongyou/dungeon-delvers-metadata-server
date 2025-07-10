// index.js (API 路由修正版)

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import helmet from 'helmet';
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
    logger
} from './utils.js';
import { gql } from 'graphql-request';
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

// 基本安全設置
app.use(helmet({
  contentSecurityPolicy: false, // 允許 SVG 內容
  crossOriginEmbedderPolicy: false // 允許跨域嵌入
}));

// 數據壓縮
app.use(compression());

// 基本 rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 100, // 每個 IP 最多 100 次請求
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 15 * 60 // 15 分鐘後重試
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', limiter);

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

// 更新 CORS 設置以支持 NFT 市場
const allowedOrigins = [
    'https://www.soulshard.fun',
    'https://opensea.io',
    'https://marketplace.axieinfinity.com',
    'https://nft.gamfi.io',
    'https://element.market',
    'https://x2y2.io',
    'https://looksrare.org',
    'https://www.okx.com',
    'https://okx.com',
    'https://nft.okx.com',
    'https://web3.okx.com',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:3001'
];

const corsOptions = {
    origin: function (origin, callback) {
        // 允許無來源 (Postman, curl, etc) 或允許的來源
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
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
        const query = gql`query GetHero($id: ID!) { hero(id: $id) { rarity power } }`;
        const { hero } = await graphClient.request(query, { id });
        
        // ★ 優化：如果 The Graph 找不到資料，拋出特定錯誤
        if (!hero) throw new Error(`Hero #${tokenId} not found in The Graph`);

        const svgString = generateHeroSVG({ rarity: hero.rarity, power: BigInt(hero.power) }, BigInt(tokenId));
        const image_data = Buffer.from(svgString).toString('base64');
        return {
            name: `Dungeon Delvers Hero #${tokenId}`,
            description: "A brave hero from the world of Dungeon Delvers, ready for adventure.",
            image: `data:image/svg+xml;base64,${image_data}`,
            attributes: [ { trait_type: "Rarity", value: hero.rarity }, { trait_type: "Power", value: Number(hero.power) } ],
        };
    });
    res.json(metadata);
}));

app.get('/api/relic/:tokenId', handleRequest(async (req, res) => {
    const { tokenId } = req.params;
    const cacheKey = `relic-${tokenId}`;
    const id = `${contractAddresses.relic.toLowerCase()}-${tokenId}`;

    const metadata = await withCache(cacheKey, async () => {
        const query = gql`query GetRelic($id: ID!) { relic(id: $id) { rarity capacity } }`;
        const { relic } = await graphClient.request(query, { id });
        
        // ★ 優化：如果 The Graph 找不到資料，拋出特定錯誤
        if (!relic) throw new Error(`Relic #${tokenId} not found in The Graph`);

        const svgString = generateRelicSVG(relic, BigInt(tokenId));
        const image_data = Buffer.from(svgString).toString('base64');
        return {
            name: `Dungeon Delvers Relic #${tokenId}`,
            description: "An ancient relic imbued with mysterious powers.",
            image: `data:image/svg+xml;base64,${image_data}`,
            attributes: [ { trait_type: "Rarity", value: relic.rarity }, { trait_type: "Capacity", value: relic.capacity } ],
        };
    });
    res.json(metadata);
}));

app.get('/api/party/:tokenId', handleRequest(async (req, res) => {
    const { tokenId } = req.params;
    const cacheKey = `party-${tokenId}`;
    const id = `${contractAddresses.party.toLowerCase()}-${tokenId}`;
    
    const metadata = await withCache(cacheKey, async () => {
        const query = gql`query GetParty($id: ID!) { party(id: $id) { totalPower totalCapacity partyRarity heroes { id } } }`;
        const { party } = await graphClient.request(query, { id });
        // ★ 優化：如果 The Graph 找不到資料，拋出特定錯誤
        if (!party) throw new Error(`Party #${tokenId} not found in The Graph`);
        
        const partyData = { ...party, heroIds: party.heroes, totalPower: BigInt(party.totalPower), totalCapacity: BigInt(party.totalCapacity) };
        const svgString = generatePartySVG(partyData, BigInt(tokenId));
        const image_data = Buffer.from(svgString).toString('base64');
        return {
            name: `Dungeon Delvers Party #${tokenId}`,
            description: "A brave party of delvers, united for a common goal.",
            image: `data:image/svg+xml;base64,${image_data}`,
            attributes: [ { trait_type: "Total Power", value: Number(party.totalPower) }, { trait_type: "Total Capacity", value: Number(party.totalCapacity) }, { trait_type: "Party Rarity", value: party.partyRarity } ],
        };
    });
    res.json(metadata);
}));


// --- Profile 和 VIP 端點 (已修正路由) ---

// ★ 核心修正：將路由從 /api/profile/ 改為 /api/playerprofile/
app.get('/api/playerprofile/:tokenId', handleRequest(async (req, res) => {
    const { tokenId } = req.params;
    const cacheKey = `profile-${tokenId}`;

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

        const query = gql`
            query GetProfile($id: Bytes!) {
                player(id: $id) {
                    profile {
                        experience
                        level
                    }
                }
            }`;
        const { player } = await graphClient.request(query, { id: owner.toLowerCase() });
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

// ★ 核心修正：將路由從 /api/vip/ 改為 /api/vipstaking/
app.get('/api/vipstaking/:tokenId', handleRequest(async (req, res) => {
    const { tokenId } = req.params;
    const cacheKey = `vip-${tokenId}`;

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

        const query = gql`
            query GetVip($id: Bytes!) {
                player(id: $id) {
                    vip {
                        level
                        stakedAmount
                    }
                }
            }`;
        const { player } = await graphClient.request(query, { id: owner.toLowerCase() });
        const vip = player?.vip;

        // ★ 優化：如果 The Graph 找不到資料，拋出特定錯誤
        if (!vip) throw new Error(`VIP data not found in The Graph for owner ${owner}`);

        const stakedValueUSD = await publicClient.readContract({
            address: contractAddresses.oracle,
            abi: abis.oracle,
            functionName: 'getAmountOut',
            args: [contractAddresses.soulShard, BigInt(vip.stakedAmount)]
        });

        const svgString = generateVipSVG({ level: vip.level, stakedValueUSD }, BigInt(tokenId));
        const image_data = Buffer.from(svgString).toString('base64');
        return {
            name: `Dungeon Delvers VIP #${tokenId}`,
            description: "A soul-bound VIP card that provides in-game bonuses based on the staked value.",
            image: `data:image/svg+xml;base64,${image_data}`,
            attributes: [
                { trait_type: "Level", value: vip.level },
                { display_type: "number", trait_type: "Staked Value (USD)", value: Number(formatEther(stakedValueUSD)) },
            ],
        };
    });
    res.json(metadata);
}));

// 健康檢查端點
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

const server = app.listen(PORT, () => {
  console.log(`Metadata server with cache and The Graph integration listening on port ${PORT}`);
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
