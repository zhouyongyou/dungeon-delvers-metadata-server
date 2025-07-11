// index.js (靜態 JSON 讀取版)

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// 簡化的 CORS 配置
app.use(cors());
app.use(express.json());

// 開發環境下提供靜態文件服務（可選）
if (process.env.NODE_ENV === 'development') {
  console.log('🔧 Development mode: Serving static files locally');
  app.use('/images', express.static(path.join(__dirname, '../../public/images')));
  app.use('/assets', express.static(path.join(__dirname, '../../public/assets')));
}

// JSON 文件路徑配置 - 使用相對路徑
const JSON_BASE_PATH = path.join(__dirname, '../../api');

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

// 獲取 fallback metadata 的函數
function getFallbackMetadata(type, tokenId, rarity = 1) {
  const fallbacks = {
    hero: {
      name: `Hero #${tokenId}`,
      description: `A powerful hero ready for adventure`,
      image: `https://www.dungeondelvers.xyz/images/hero/hero-${Math.max(1, Math.min(5, rarity))}.png`,
      attributes: [
        { trait_type: 'Rarity', value: 'Common' },
        { trait_type: 'Power', value: 25 },
        { trait_type: 'Token ID', value: parseInt(tokenId) }
      ]
    },
    relic: {
      name: `Relic #${tokenId}`,
      description: `A mystical relic with magical properties`,
      image: `https://www.dungeondelvers.xyz/images/relic/relic-${Math.max(1, Math.min(5, rarity))}.png`,
      attributes: [
        { trait_type: 'Rarity', value: 'Common' },
        { trait_type: 'Capacity', value: 1 },
        { trait_type: 'Token ID', value: parseInt(tokenId) }
      ]
    },
    party: {
      name: `Party #${tokenId}`,
      description: `An adventuring party ready for dungeons`,
      image: `https://www.dungeondelvers.xyz/images/party/party.png`,
      attributes: [
        { trait_type: 'Category', value: 'Party' },
        { trait_type: 'Token ID', value: parseInt(tokenId) }
      ]
    },
    vip: {
      name: `VIP Membership #${tokenId}`,
      description: `A VIP membership NFT with special privileges`,
      image: `https://www.dungeondelvers.xyz/assets/images/collections/vip-logo.png`,
      attributes: [
        { trait_type: 'Category', value: 'VIP' },
        { trait_type: 'Token ID', value: parseInt(tokenId) }
      ]
    },
    profile: {
      name: `Player Profile #${tokenId}`,
      description: `A player profile tracking achievements`,
      image: `https://www.dungeondelvers.xyz/assets/images/collections/profile-logo.png`,
      attributes: [
        { trait_type: 'Category', value: 'Profile' },
        { trait_type: 'Token ID', value: parseInt(tokenId) }
      ]
    }
  };

  return fallbacks[type] || {
    name: `Unknown NFT #${tokenId}`,
    description: `An unknown NFT`,
    image: `https://www.dungeondelvers.xyz/assets/images/collections/hero-logo.png`,
    attributes: [{ trait_type: 'Token ID', value: parseInt(tokenId) }]
  };
}

// 簡化的健康檢查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'dungeon-delvers-metadata-server',
    version: '2.0.0-static'
  });
});

// Hero Metadata - 根據稀有度選擇圖片
app.get('/api/hero/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;
    
    // 從子圖獲取稀有度信息
    let rarity = 1; // 默認稀有度
    try {
      const graphqlResponse = await fetch(process.env.THE_GRAPH_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetHeroRarity($tokenId: String!) {
              hero(id: $tokenId) {
                rarity
              }
            }
          `,
          variables: { tokenId: tokenId }
        })
      });
      
      if (graphqlResponse.ok) {
        const { data } = await graphqlResponse.json();
        if (data?.hero?.rarity) {
          rarity = parseInt(data.hero.rarity);
        }
      }
    } catch (error) {
      console.warn(`無法從子圖獲取英雄稀有度，使用默認值: ${error.message}`);
    }
    
    // 根據稀有度選擇圖片 (1-5)
    const heroId = Math.max(1, Math.min(5, rarity));
    const jsonPath = path.join(JSON_BASE_PATH, 'hero', `${heroId}.json`);
    
    let metadata = readJSONFile(jsonPath);
    
    if (!metadata) {
      console.warn(`Hero JSON not found for rarity ${heroId}, using fallback`);
      metadata = getFallbackMetadata('hero', tokenId, rarity);
    } else {
      // 更新 token ID 相關信息
      metadata.name = `${metadata.name} #${tokenId}`;
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

    res.json(metadata);
  } catch (error) {
    console.error('Hero metadata error:', error);
    res.status(500).json({ error: 'Failed to fetch hero metadata' });
  }
});

// Relic Metadata - 根據稀有度選擇圖片
app.get('/api/relic/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;
    
    // 從子圖獲取稀有度信息
    let rarity = 1; // 默認稀有度
    try {
      const graphqlResponse = await fetch(process.env.THE_GRAPH_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetRelicRarity($tokenId: String!) {
              relic(id: $tokenId) {
                rarity
              }
            }
          `,
          variables: { tokenId: tokenId }
        })
      });
      
      if (graphqlResponse.ok) {
        const { data } = await graphqlResponse.json();
        if (data?.relic?.rarity) {
          rarity = parseInt(data.relic.rarity);
        }
      }
    } catch (error) {
      console.warn(`無法從子圖獲取聖物稀有度，使用默認值: ${error.message}`);
    }
    
    // 根據稀有度選擇圖片 (1-5)
    const relicId = Math.max(1, Math.min(5, rarity));
    const jsonPath = path.join(JSON_BASE_PATH, 'relic', `${relicId}.json`);
    
    let metadata = readJSONFile(jsonPath);
    
    if (!metadata) {
      console.warn(`Relic JSON not found for rarity ${relicId}, using fallback`);
      metadata = getFallbackMetadata('relic', tokenId, rarity);
    } else {
      // 更新 token ID 相關信息
      metadata.name = `${metadata.name} #${tokenId}`;
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

    res.json(metadata);
  } catch (error) {
    console.error('Relic metadata error:', error);
    res.status(500).json({ error: 'Failed to fetch relic metadata' });
  }
});

// Party Metadata - 直接讀取 JSON
app.get('/api/party/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;
    const jsonPath = path.join(JSON_BASE_PATH, 'party', 'party.json');
    
    let metadata = readJSONFile(jsonPath);
    
    if (!metadata) {
      console.warn(`Party JSON not found for tokenId ${tokenId}, using fallback`);
      metadata = getFallbackMetadata('party', tokenId);
    } else {
      // 更新 token ID 相關信息
      metadata.name = `${metadata.name} #${tokenId}`;
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

    res.json(metadata);
  } catch (error) {
    console.error('Party metadata error:', error);
    res.status(500).json({ error: 'Failed to fetch party metadata' });
  }
});

// VIP Metadata - 直接讀取 JSON
app.get('/api/vipstaking/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;
    const jsonPath = path.join(JSON_BASE_PATH, 'vip', 'vip.json');
    
    let metadata = readJSONFile(jsonPath);
    
    if (!metadata) {
      console.warn(`VIP JSON not found for tokenId ${tokenId}, using fallback`);
      metadata = getFallbackMetadata('vip', tokenId);
    } else {
      // 更新 token ID 相關信息
      metadata.name = `${metadata.name} #${tokenId}`;
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

    res.json(metadata);
  } catch (error) {
    console.error('VIP metadata error:', error);
    res.status(500).json({ error: 'Failed to fetch VIP metadata' });
  }
});

// Player Profile Metadata - 直接讀取 JSON
app.get('/api/playerprofile/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;
    const jsonPath = path.join(JSON_BASE_PATH, 'profile', 'profile.json');
    
    let metadata = readJSONFile(jsonPath);
    
    if (!metadata) {
      console.warn(`Profile JSON not found for tokenId ${tokenId}, using fallback`);
      metadata = getFallbackMetadata('profile', tokenId);
    } else {
      // 更新 token ID 相關信息
      metadata.name = `${metadata.name} #${tokenId}`;
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

    res.json(metadata);
  } catch (error) {
    console.error('Player Profile metadata error:', error);
    res.status(500).json({ error: 'Failed to fetch player profile metadata' });
  }
});

// 集合級別的 metadata
app.get('/api/collection/:contractName', async (req, res) => {
  try {
    const { contractName } = req.params;
    const collectionPath = path.join(__dirname, '../../public/metadata', `${contractName}-collection.json`);
    
    let metadata = readJSONFile(collectionPath);
    
    if (!metadata) {
      return res.status(404).json({ error: 'Collection metadata not found' });
    }

    res.json(metadata);
  } catch (error) {
    console.error('Collection metadata error:', error);
    res.status(500).json({ error: 'Failed to fetch collection metadata' });
  }
});

// 根路徑
app.get('/', (req, res) => {
  res.json({
    service: 'Dungeon Delvers Metadata Server',
    version: '2.0.0-static',
    description: 'Static JSON-based metadata server for Dungeon Delvers NFTs',
    endpoints: [
      '/api/hero/:tokenId',
      '/api/relic/:tokenId',
      '/api/party/:tokenId',
      '/api/vipstaking/:tokenId',
      '/api/playerprofile/:tokenId',
      '/api/collection/:contractName',
      '/health'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Metadata Server running on port ${PORT}`);
  console.log(`📁 Reading JSON files from: ${JSON_BASE_PATH}`);
  console.log(`🌐 Using full HTTPS URLs for images: https://www.dungeondelvers.xyz/images/`);
  
  // 調試路徑解析
  console.log(`🔍 Current working directory: ${process.cwd()}`);
  console.log(`🔍 __dirname: ${__dirname}`);
  console.log(`🔍 Resolved JSON path: ${path.resolve(JSON_BASE_PATH)}`);
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔧 Development mode: Local static files available at /images and /assets`);
  }
});
