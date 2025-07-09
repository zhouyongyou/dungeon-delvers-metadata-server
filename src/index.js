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
    fallbackMetadata
} from './utils.js';
import { gql } from 'graphql-request';
import { formatEther } from 'viem';

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

requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        logger.error(`Missing required environment variable: ${varName}`);
        process.exit(1);
    }
});

logger.info('Server starting', { 
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || 'development'
});

const app = express();
const PORT = process.env.PORT || 3001;

// 改進的 CORS 配置
const allowedOrigins = [
    'https://www.soulshard.fun',
    'https://opensea.io',
    'https://testnets.opensea.io',
    'https://marketplace.soulshard.fun',
    ...(process.env.NODE_ENV === 'development' ? ['http://localhost:5173', 'http://localhost:3000'] : [])
];

const corsOptions = {
    origin: function (origin, callback) {
        // 允許沒有 origin 的請求（如 mobile apps, curl 等）
        if (!origin) return callback(null, true);
        
        // 檢查是否在允許清單中，或者是否包含允許的域名
        if (allowedOrigins.some(allowed => origin.includes(allowed.replace('https://', '')))) {
            callback(null, true);
        } else {
            logger.error('CORS blocked origin', null, { origin });
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// 性能監控中間件
app.use((req, res, next) => {
    const startTime = Date.now();
    
    // 記錄請求開始
    logger.info('Request started', {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip
    });
    
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.info('Request completed', {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration,
            contentLength: res.get('Content-Length')
        });
    });
    
    next();
});

const handleRequest = (handler, type = 'unknown') => async (req, res) => {
    try {
        await handler(req, res);
    } catch (error) {
        logger.error(`Request handler failed`, error, {
            path: req.path,
            tokenId: req.params.tokenId,
            type
        });
        
        // 如果是 GraphQL 錯誤，嘗試返回降級數據
        if (error.message.includes('not found') || error.message.includes('GraphQL')) {
            try {
                const fallback = fallbackMetadata(req.params.tokenId, type);
                logger.info('Fallback metadata provided', { 
                    tokenId: req.params.tokenId, 
                    type 
                });
                return res.json(fallback);
            } catch (fallbackError) {
                logger.error('Fallback generation failed', fallbackError, { 
                    tokenId: req.params.tokenId, 
                    type 
                });
            }
        }
        
        res.status(500).json({ 
            error: 'Failed to fetch token metadata.',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
            tokenId: req.params.tokenId
        });
    }
};

// 健康檢查端點
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    });
});

// --- Hero, Relic, Party 端點 (優化版) ---
app.get('/api/hero/:tokenId', handleRequest(async (req, res) => {
    const { tokenId } = req.params;
    const cacheKey = `hero-${tokenId}`;
    const id = `${contractAddresses.hero.toLowerCase()}-${tokenId}`;

    const metadata = await withCache(cacheKey, async () => {
        const query = gql`query GetHero($id: ID!) { hero(id: $id) { rarity power } }`;
        const { hero } = await graphClient.request(query, { id });
        if (!hero) throw new Error('Hero not found in The Graph');

        const svgString = generateHeroSVG({ rarity: hero.rarity, power: BigInt(hero.power) }, BigInt(tokenId));
        const image_data = Buffer.from(svgString).toString('base64');
        return {
            name: `Dungeon Delvers Hero #${tokenId}`,
            description: "A brave hero from the world of Dungeon Delvers, ready for adventure.",
            image: `data:image/svg+xml;base64,${image_data}`,
            attributes: [ { trait_type: "Rarity", value: hero.rarity }, { trait_type: "Power", value: Number(hero.power) } ],
        };
    }, 'hero');
    res.json(metadata);
}, 'hero'));

app.get('/api/relic/:tokenId', handleRequest(async (req, res) => {
    const { tokenId } = req.params;
    const cacheKey = `relic-${tokenId}`;
    const id = `${contractAddresses.relic.toLowerCase()}-${tokenId}`;

    const metadata = await withCache(cacheKey, async () => {
        const query = gql`query GetRelic($id: ID!) { relic(id: $id) { rarity capacity } }`;
        const { relic } = await graphClient.request(query, { id });
        if (!relic) throw new Error('Relic not found in The Graph');

        const svgString = generateRelicSVG(relic, BigInt(tokenId));
        const image_data = Buffer.from(svgString).toString('base64');
        return {
            name: `Dungeon Delvers Relic #${tokenId}`,
            description: "An ancient relic imbued with mysterious powers.",
            image: `data:image/svg+xml;base64,${image_data}`,
            attributes: [ { trait_type: "Rarity", value: relic.rarity }, { trait_type: "Capacity", value: relic.capacity } ],
        };
    }, 'relic');
    res.json(metadata);
}, 'relic'));

app.get('/api/party/:tokenId', handleRequest(async (req, res) => {
    const { tokenId } = req.params;
    const cacheKey = `party-${tokenId}`;
    const id = `${contractAddresses.party.toLowerCase()}-${tokenId}`;
    
    const metadata = await withCache(cacheKey, async () => {
        const query = gql`query GetParty($id: ID!) { party(id: $id) { totalPower totalCapacity partyRarity heroes { id } } }`;
        const { party } = await graphClient.request(query, { id });
        if (!party) throw new Error('Party not found in The Graph');
        
        const partyData = { ...party, heroCount: party.heroes.length, totalPower: BigInt(party.totalPower), totalCapacity: BigInt(party.totalCapacity) };
        const svgString = generatePartySVG(partyData, BigInt(tokenId));
        const image_data = Buffer.from(svgString).toString('base64');
        return {
            name: `Dungeon Delvers Party #${tokenId}`,
            description: "A brave party of delvers, united for a common goal.",
            image: `data:image/svg+xml;base64,${image_data}`,
            attributes: [ { trait_type: "Total Power", value: Number(party.totalPower) }, { trait_type: "Total Capacity", value: Number(party.totalCapacity) }, { trait_type: "Party Rarity", value: party.partyRarity } ],
        };
    }, 'party');
    res.json(metadata);
}, 'party'));


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
        if (!profile) throw new Error('Profile not found in The Graph for owner');

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
    }, 'profile');
    res.json(metadata);
}, 'profile'));

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
        if (!vip) throw new Error('VIP not found in The Graph for owner');

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
    }, 'vip');
    res.json(metadata);
}, 'vip'));

app.listen(PORT, () => {
    logger.info('Server started successfully', {
        port: PORT,
        endpoints: [
            '/api/hero/:tokenId',
            '/api/relic/:tokenId',
            '/api/party/:tokenId',
            '/api/playerprofile/:tokenId',
            '/api/vipstaking/:tokenId',
            '/health'
        ]
    });
});
