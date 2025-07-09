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
    graphClient
} from './utils.js';
import { gql } from 'graphql-request';
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

// --- Hero, Relic, Party 端點 (保持不變) ---
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
        if (!relic) throw new Error('Relic not found in The Graph');

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
    });
    res.json(metadata);
}));

app.listen(PORT, () => console.log(`Metadata server with cache and The Graph integration listening on port ${PORT}`));
