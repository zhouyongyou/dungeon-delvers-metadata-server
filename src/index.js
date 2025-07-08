// index.js (CORS 和快取優化版)

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
  withCache // ★ 新增：導入快取函式
} from './utils.js';
import { formatEther } from 'viem';

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = ['https://www.soulshard.fun', 'http://localhost:5173'];
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

// 通用錯誤處理中介軟體
const handleRequest = (handler) => async (req, res) => {
    try {
        await handler(req, res);
    } catch (error) {
        console.error(`[Error on ${req.path}]`, error);
        res.status(500).json({ 
            error: 'Failed to fetch token metadata.',
            message: error.message 
        });
    }
};

// API 端點: /api/hero/:tokenId (★ 快取優化)
app.get('/api/hero/:tokenId', handleRequest(async (req, res) => {
    const { tokenId } = req.params;
    const cacheKey = `hero-${tokenId}`;

    const metadata = await withCache(cacheKey, async () => {
        const [rarity, power] = await publicClient.readContract({
            address: contractAddresses.hero,
            abi: abis.hero,
            functionName: 'getHeroProperties',
            args: [BigInt(tokenId)],
        });

        const svgString = generateHeroSVG({ rarity, power }, BigInt(tokenId));
        const image_data = Buffer.from(svgString).toString('base64');
        
        return {
            name: `Dungeon Delvers Hero #${tokenId}`,
            description: "A brave hero from the world of Dungeon Delvers, ready for adventure.",
            image: `data:image/svg+xml;base64,${image_data}`,
            attributes: [
                { trait_type: "Rarity", value: rarity },
                { trait_type: "Power", value: Number(power) },
            ],
        };
    });
    res.json(metadata);
}));

// API 端點: /api/relic/:tokenId (★ 快取優化)
app.get('/api/relic/:tokenId', handleRequest(async (req, res) => {
    const { tokenId } = req.params;
    const cacheKey = `relic-${tokenId}`;

    const metadata = await withCache(cacheKey, async () => {
        const [rarity, capacity] = await publicClient.readContract({
            address: contractAddresses.relic,
            abi: abis.relic,
            functionName: 'getRelicProperties',
            args: [BigInt(tokenId)],
        });

        const svgString = generateRelicSVG({ rarity, capacity }, BigInt(tokenId));
        const image_data = Buffer.from(svgString).toString('base64');

        return {
            name: `Dungeon Delvers Relic #${tokenId}`,
            description: "An ancient relic imbued with mysterious powers.",
            image: `data:image/svg+xml;base64,${image_data}`,
            attributes: [
                { trait_type: "Rarity", value: rarity },
                { trait_type: "Capacity", value: capacity },
            ],
        };
    });
    res.json(metadata);
}));

// API 端點: /api/party/:tokenId (★ 快取優化)
app.get('/api/party/:tokenId', handleRequest(async (req, res) => {
    const { tokenId } = req.params;
    const cacheKey = `party-${tokenId}`;
    
    const metadata = await withCache(cacheKey, async () => {
        const composition = await publicClient.readContract({
            address: contractAddresses.party,
            abi: abis.party,
            functionName: 'getPartyComposition',
            args: [BigInt(tokenId)],
        });
        
        const svgString = generatePartySVG(composition, BigInt(tokenId));
        const image_data = Buffer.from(svgString).toString('base64');

        return {
            name: `Dungeon Delvers Party #${tokenId}`,
            description: "A brave party of delvers, united for a common goal.",
            image: `data:image/svg+xml;base64,${image_data}`,
            attributes: [
                { trait_type: "Total Power", value: Number(composition.totalPower) },
                { trait_type: "Total Capacity", value: Number(composition.totalCapacity) },
                { trait_type: "Party Rarity", value: composition.partyRarity },
            ],
        };
    });
    res.json(metadata);
}));

// API 端點: /api/profile/:tokenId (★ 快取優化)
app.get('/api/profile/:tokenId', handleRequest(async (req, res) => {
    const { tokenId } = req.params;
    // 對於動態 NFT，我們可以設定較短的快取時間，例如 60 秒
    const cacheKey = `profile-${tokenId}`;

    const metadata = await withCache(cacheKey, async () => {
        const owner = await publicClient.readContract({
            address: contractAddresses.playerProfile,
            abi: abis.playerProfile,
            functionName: 'ownerOf',
            args: [BigInt(tokenId)],
        });
        const [level, experience] = await Promise.all([
            publicClient.readContract({ address: contractAddresses.playerProfile, abi: abis.playerProfile, functionName: 'getLevel', args: [owner] }),
            publicClient.readContract({ address: contractAddresses.playerProfile, abi: abis.playerProfile, functionName: 'getExperience', args: [owner] })
        ]);

        const svgString = generateProfileSVG({ level: Number(level), experience }, BigInt(tokenId));
        const image_data = Buffer.from(svgString).toString('base64');

        return {
            name: `Dungeon Delvers Profile #${tokenId}`,
            description: "A soul-bound achievement token for Dungeon Delvers.",
            image: `data:image/svg+xml;base64,${image_data}`,
            attributes: [
                { trait_type: "Level", value: Number(level) },
                { display_type: "number", trait_type: "Experience", value: Number(experience) },
            ],
        };
    });
    res.json(metadata);
}));

// API 端點: /api/vip/:tokenId (★ 快取優化)
app.get('/api/vip/:tokenId', handleRequest(async (req, res) => {
    const { tokenId } = req.params;
    const cacheKey = `vip-${tokenId}`;

    const metadata = await withCache(cacheKey, async () => {
        const owner = await publicClient.readContract({
            address: contractAddresses.vipStaking,
            abi: abis.vipStaking,
            functionName: 'ownerOf',
            args: [BigInt(tokenId)],
        });
        const [level, stakeInfo] = await Promise.all([
            publicClient.readContract({ address: contractAddresses.vipStaking, abi: abis.vipStaking, functionName: 'getVipLevel', args: [owner] }),
            publicClient.readContract({ address: contractAddresses.vipStaking, abi: abis.vipStaking, functionName: 'userStakes', args: [owner] })
        ]);
        const stakedAmount = stakeInfo[0];
        const stakedValueUSD = await publicClient.readContract({
            address: contractAddresses.oracle,
            abi: abis.oracle,
            functionName: 'getAmountOut',
            args: [contractAddresses.soulShard, stakedAmount]
        });

        const svgString = generateVipSVG({ level, stakedValueUSD }, BigInt(tokenId));
        const image_data = Buffer.from(svgString).toString('base64');

        return {
            name: `Dungeon Delvers VIP #${tokenId}`,
            description: "A soul-bound VIP card that provides in-game bonuses based on the staked value.",
            image: `data:image/svg+xml;base64,${image_data}`,
            attributes: [
                { trait_type: "Level", value: level },
                { display_type: "number", trait_type: "Staked Value (USD)", value: Number(formatEther(stakedValueUSD)) },
            ],
        };
    });
    res.json(metadata);
}));

app.listen(PORT, () => console.log(`Metadata server with cache listening on port ${PORT}`));
