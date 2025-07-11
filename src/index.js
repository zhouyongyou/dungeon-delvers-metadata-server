// index.js (API 路由修正版)

const express = require('express');
const cors = require('cors');
const { gql } = require('graphql-request');
const { GraphQLClient } = require('graphql-request');

const app = express();
const PORT = process.env.PORT || 3001;

// 簡化的 CORS 配置
app.use(cors());
app.use(express.json());

// 簡化的 GraphQL 客戶端
const graphqlClient = new GraphQLClient(process.env.VITE_THE_GRAPH_STUDIO_API_URL || 'https://api.studio.thegraph.com/query/your-subgraph-url');

// 簡化的查詢
const HERO_QUERY = gql`
  query GetHero($id: ID!) {
    hero(id: $id) {
      id
      owner
      power
      rarity
      createdAt
    }
  }
`;

const RELIC_QUERY = gql`
  query GetRelic($id: ID!) {
    relic(id: $id) {
      id
      owner
      capacity
      rarity
      createdAt
    }
  }
`;

const PARTY_QUERY = gql`
  query GetParty($id: ID!) {
    party(id: $id) {
      id
      owner
      totalPower
      totalCapacity
      partyRarity
      heros {
        id
        power
        rarity
      }
      relics {
        id
        capacity
        rarity
      }
    }
  }
`;

// 簡化的健康檢查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'dungeon-delvers-metadata-server'
  });
});

// 簡化的 Hero Metadata
app.get('/api/hero/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;
    const graphqlId = `0x2cf5429ddbd2df730a6668b50200233c76c1116f-${tokenId}`;
    
    let data;
    try {
      data = await graphqlClient.request(HERO_QUERY, { id: graphqlId });
    } catch (graphqlError) {
      console.warn(`GraphQL query failed for hero ${tokenId}, using fallback data:`, graphqlError.message);
      // 使用 fallback 數據
      data = { hero: null };
    }
    
    if (!data.hero) {
      // 返回靜態 metadata
      const heroId = (parseInt(tokenId) % 5) + 1; // 確保在 1-5 範圍內
      const rarity = Math.min(Math.ceil(parseInt(tokenId) / 20), 5); // 根據 tokenId 計算稀有度
      const power = [0, 32, 75, 125, 175, 227][rarity] || 100;
      
      const metadata = {
        name: `Hero #${tokenId}`,
        description: `A powerful hero with ${power} power and rarity ${rarity}`,
        image: `https://dungeondelvers.xyz/images/hero/hero-${heroId}.png`,
        attributes: [
          { trait_type: 'Power', value: power },
          { trait_type: 'Rarity', value: rarity },
          { trait_type: 'Token ID', value: parseInt(tokenId) }
        ]
      };

      return res.json(metadata);
    }

    const heroId = (parseInt(tokenId) % 5) + 1; // 確保在 1-5 範圍內
    const metadata = {
      name: `Hero #${tokenId}`,
      description: `A powerful hero with ${data.hero.power} power and rarity ${data.hero.rarity}`,
      image: `https://dungeondelvers.xyz/images/hero/hero-${heroId}.png`,
      attributes: [
        { trait_type: 'Power', value: data.hero.power },
        { trait_type: 'Rarity', value: data.hero.rarity },
        { trait_type: 'Created At', value: new Date(data.hero.createdAt * 1000).toISOString() }
      ]
    };

    res.json(metadata);
  } catch (error) {
    console.error('Hero metadata error:', error);
    res.status(500).json({ error: 'Failed to fetch hero metadata' });
  }
});

// 簡化的 Relic Metadata
app.get('/api/relic/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;
    const graphqlId = `0x548ea33d0dec74bbe9a3f0d1b5e4c660bf59e5a5-${tokenId}`;
    
    let data;
    try {
      data = await graphqlClient.request(RELIC_QUERY, { id: graphqlId });
    } catch (graphqlError) {
      console.warn(`GraphQL query failed for relic ${tokenId}, using fallback data:`, graphqlError.message);
      data = { relic: null };
    }
    
    if (!data.relic) {
      // 返回靜態 metadata
      const relicId = (parseInt(tokenId) % 5) + 1;
      const rarity = Math.min(Math.ceil(parseInt(tokenId) / 20), 5);
      const capacity = rarity;
      
      const metadata = {
        name: `Relic #${tokenId}`,
        description: `A mystical relic with ${capacity} capacity and rarity ${rarity}`,
        image: `https://dungeondelvers.xyz/images/relic/relic-${relicId}.png`,
        attributes: [
          { trait_type: 'Capacity', value: capacity },
          { trait_type: 'Rarity', value: rarity },
          { trait_type: 'Token ID', value: parseInt(tokenId) }
        ]
      };

      return res.json(metadata);
    }

    const relicId = (parseInt(tokenId) % 5) + 1;
    const metadata = {
      name: `Relic #${tokenId}`,
      description: `A mystical relic with ${data.relic.capacity} capacity and rarity ${data.relic.rarity}`,
      image: `https://dungeondelvers.xyz/images/relic/relic-${relicId}.png`,
      attributes: [
        { trait_type: 'Capacity', value: data.relic.capacity },
        { trait_type: 'Rarity', value: data.relic.rarity },
        { trait_type: 'Created At', value: new Date(data.relic.createdAt * 1000).toISOString() }
      ]
    };

    res.json(metadata);
  } catch (error) {
    console.error('Relic metadata error:', error);
    res.status(500).json({ error: 'Failed to fetch relic metadata' });
  }
});

// 簡化的 Party Metadata
app.get('/api/party/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;
    const graphqlId = `0x78dba7671753191ffeebeed702aab4f2816d70d-${tokenId}`;
    
    const data = await graphqlClient.request(PARTY_QUERY, { id: graphqlId });
    
    if (!data.party) {
      return res.status(404).json({ error: 'Party not found' });
    }

    const metadata = {
      name: `Party #${tokenId}`,
      description: `A legendary party with ${data.party.totalPower} total power and ${data.party.totalCapacity} capacity`,
      image: `https://dungeondelvers.xyz/images/party/party.png`,
      attributes: [
        { trait_type: 'Total Power', value: data.party.totalPower },
        { trait_type: 'Total Capacity', value: data.party.totalCapacity },
        { trait_type: 'Party Rarity', value: data.party.partyRarity },
        { trait_type: 'Heroes Count', value: data.party.heros?.length || 0 },
        { trait_type: 'Relics Count', value: data.party.relics?.length || 0 }
      ]
    };

    res.json(metadata);
  } catch (error) {
    console.error('Party metadata error:', error);
    res.status(500).json({ error: 'Failed to fetch party metadata' });
  }
});

// 簡化的 VIP Metadata
app.get('/api/vipstaking/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;
    
    const metadata = {
      name: `VIP Card #${tokenId}`,
      description: `An exclusive VIP membership card`,
      image: `https://dungeondelvers.xyz/images/vip-placeholder.png`,
      attributes: [
        { trait_type: 'VIP Level', value: 1 },
        { trait_type: 'Token ID', value: parseInt(tokenId) }
      ]
    };

    res.json(metadata);
  } catch (error) {
    console.error('VIP metadata error:', error);
    res.status(500).json({ error: 'Failed to fetch VIP metadata' });
  }
});

// 簡化的 Player Profile Metadata
app.get('/api/playerprofile/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;
    
    const metadata = {
      name: `Player Profile #${tokenId}`,
      description: `A player's achievement profile`,
      image: `https://dungeondelvers.xyz/assets/images/collections/profile-logo.png`,
      attributes: [
        { trait_type: 'Level', value: 1 },
        { trait_type: 'Experience', value: 0 }
      ]
    };

    res.json(metadata);
  } catch (error) {
    console.error('Player Profile metadata error:', error);
    res.status(500).json({ error: 'Failed to fetch player profile metadata' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Simplified Metadata Server running on port ${PORT}`);
});
