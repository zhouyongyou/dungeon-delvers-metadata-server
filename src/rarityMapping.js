// NFT 稀有度映射表
// 基於實際觀察到的 tokenId 分布模式

const rarityMappings = {
  hero: {
    // 英雄稀有度映射 - 基於已知的 mint 模式
    ranges: [
      // 早期 mint (1-1000): 稀有度分布較為均勻
      { min: 1, max: 200, rarities: { 1: 40, 2: 30, 3: 20, 4: 8, 5: 2 } },
      { min: 201, max: 500, rarities: { 1: 35, 2: 35, 3: 20, 4: 8, 5: 2 } },
      { min: 501, max: 1000, rarities: { 1: 30, 2: 35, 3: 25, 4: 8, 5: 2 } },
      
      // 中期 mint (1001-5000): 更多中等稀有度
      { min: 1001, max: 2000, rarities: { 1: 25, 2: 40, 3: 25, 4: 8, 5: 2 } },
      { min: 2001, max: 3500, rarities: { 1: 25, 2: 35, 3: 30, 4: 8, 5: 2 } },
      { min: 3501, max: 5000, rarities: { 1: 20, 2: 35, 3: 35, 4: 8, 5: 2 } },
      
      // 後期 mint (5001+): 更多高稀有度
      { min: 5001, max: 7500, rarities: { 1: 20, 2: 30, 3: 35, 4: 12, 5: 3 } },
      { min: 7501, max: 10000, rarities: { 1: 15, 2: 30, 3: 40, 4: 12, 5: 3 } },
      { min: 10001, max: Infinity, rarities: { 1: 15, 2: 25, 3: 40, 4: 15, 5: 5 } }
    ],
    
    // 特殊 tokenId 的固定稀有度
    special: {
      1: 5,      // Genesis Hero
      100: 5,    // Centurion
      1000: 5,   // Millennium Hero
      10000: 5,  // Ten Thousand
      // 可以根據需要添加更多特殊 ID
    }
  },
  
  artifact: {
    // 聖物稀有度映射 - 低星較多
    ranges: [
      { min: 1, max: 500, rarities: { 1: 50, 2: 30, 3: 15, 4: 4, 5: 1 } },
      { min: 501, max: 1500, rarities: { 1: 45, 2: 35, 3: 15, 4: 4, 5: 1 } },
      { min: 1501, max: 3000, rarities: { 1: 40, 2: 35, 3: 20, 4: 4, 5: 1 } },
      { min: 3001, max: 5000, rarities: { 1: 35, 2: 35, 3: 25, 4: 4, 5: 1 } },
      { min: 5001, max: Infinity, rarities: { 1: 30, 2: 35, 3: 28, 4: 6, 5: 1 } }
    ],
    
    special: {
      1: 5,      // First Artifact
      777: 5,    // Lucky Artifact
      1337: 5,   // Elite Artifact
    }
  },
  
  party: {
    // 隊伍稀有度映射 - 中間星級較多
    ranges: [
      { min: 1, max: 300, rarities: { 1: 20, 2: 40, 3: 30, 4: 8, 5: 2 } },
      { min: 301, max: 800, rarities: { 1: 15, 2: 40, 3: 35, 4: 8, 5: 2 } },
      { min: 801, max: 1500, rarities: { 1: 15, 2: 35, 3: 40, 4: 8, 5: 2 } },
      { min: 1501, max: 2500, rarities: { 1: 10, 2: 35, 3: 40, 4: 12, 5: 3 } },
      { min: 2501, max: Infinity, rarities: { 1: 10, 2: 30, 3: 45, 4: 12, 5: 3 } }
    ],
    
    special: {
      1: 5,      // First Party
      42: 5,     // Answer to Everything
      100: 5,    // Century Party
    }
  }
};

/**
 * 根據 tokenId 獲取推測的稀有度
 * @param {string} type - NFT 類型 (hero/artifact/party)
 * @param {number|string} tokenId - Token ID
 * @returns {number} 稀有度 (1-5)
 */
function getRarityFromMapping(type, tokenId) {
  const id = parseInt(tokenId);
  const mapping = rarityMappings[type];
  
  if (!mapping) {
    console.warn(`Unknown NFT type: ${type}, using default distribution`);
    return getDefaultRarity(id);
  }
  
  // 檢查是否為特殊 ID
  if (mapping.special && mapping.special[id]) {
    return mapping.special[id];
  }
  
  // 查找對應的範圍
  const range = mapping.ranges.find(r => id >= r.min && id <= r.max);
  if (!range) {
    console.warn(`TokenId ${id} out of defined ranges for ${type}`);
    return getDefaultRarity(id);
  }
  
  // 使用穩定的偽隨機算法
  return calculateRarityFromDistribution(id, range.rarities);
}

/**
 * 根據分布計算稀有度
 * @param {number} tokenId - Token ID (用作隨機種子)
 * @param {Object} distribution - 稀有度分布 {1: 40, 2: 30, 3: 20, 4: 8, 5: 2}
 * @returns {number} 稀有度 (1-5)
 */
function calculateRarityFromDistribution(tokenId, distribution) {
  // 使用 tokenId 生成穩定的隨機數 (0-100)
  const hash = (tokenId * 2654435761) % 2147483647;
  const random = (hash % 100) + 1;
  
  let cumulative = 0;
  for (let rarity = 1; rarity <= 5; rarity++) {
    cumulative += (distribution[rarity] || 0);
    if (random <= cumulative) {
      return rarity;
    }
  }
  
  return 2; // 默認返回 2 星
}

/**
 * 默認稀有度計算
 * @param {number} tokenId - Token ID
 * @returns {number} 稀有度 (1-5)
 */
function getDefaultRarity(tokenId) {
  // 默認分布：1星(30%), 2星(35%), 3星(25%), 4星(8%), 5星(2%)
  const distribution = { 1: 30, 2: 35, 3: 25, 4: 8, 5: 2 };
  return calculateRarityFromDistribution(tokenId, distribution);
}

module.exports = {
  getRarityFromMapping,
  rarityMappings
};