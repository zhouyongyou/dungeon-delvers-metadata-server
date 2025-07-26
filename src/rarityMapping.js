// NFT 稀有度映射表
// 基於實際觀察到的 tokenId 分布模式

const rarityMappings = {
  hero: {
    // 英雄稀有度映射 - 合理的隨機分布
    ranges: [
      // 所有範圍使用相同的合理分布
      { min: 1, max: Infinity, rarities: { 1: 40, 2: 30, 3: 20, 4: 8, 5: 2 } }
    ],
    
    // 不設置特殊 tokenId
    special: {
      // 移除特殊處理，讓所有 NFT 公平隨機
    }
  },
  
  artifact: {
    // 聖物稀有度映射 - 合理分布（改為 relic）
    ranges: [
      { min: 1, max: Infinity, rarities: { 1: 40, 2: 30, 3: 20, 4: 8, 5: 2 } }
    ],
    
    special: {
      // 不設置特殊 ID
    }
  },
  
  relic: {
    // 聖物稀有度映射 - 與 artifact 相同
    ranges: [
      { min: 1, max: Infinity, rarities: { 1: 40, 2: 30, 3: 20, 4: 8, 5: 2 } }
    ],
    
    special: {
      // 不設置特殊 ID
    }
  },
  
  party: {
    // 隊伍稀有度映射 - 標準分布
    ranges: [
      { min: 1, max: Infinity, rarities: { 1: 40, 2: 30, 3: 20, 4: 8, 5: 2 } }
    ],
    
    special: {
      // 不設置特殊 ID
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
  // 默認分布：1星(40%), 2星(30%), 3星(20%), 4星(8%), 5星(2%)
  const distribution = { 1: 40, 2: 30, 3: 20, 4: 8, 5: 2 };
  return calculateRarityFromDistribution(tokenId, distribution);
}

module.exports = {
  getRarityFromMapping,
  rarityMappings
};