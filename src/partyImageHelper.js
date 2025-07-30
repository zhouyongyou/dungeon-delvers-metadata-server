// Party 圖片選擇輔助函數
// 根據總戰力選擇對應的圖片

/**
 * 根據總戰力獲取對應的 Party 圖片 URL
 * @param {number} totalPower - 總戰力值
 * @returns {string} 圖片 URL
 */
function getPartyImageByPower(totalPower) {
  const baseUrl = 'https://www.dungeondelvers.xyz/images/party';
  
  // 戰力範圍對應圖片
  const powerRanges = [
    { min: 300, max: 599, image: '300-4199/300-599.png' },
    { min: 600, max: 899, image: '300-4199/600-899.png' },
    { min: 900, max: 1199, image: '300-4199/900-1199.png' },
    { min: 1200, max: 1499, image: '300-4199/1200-1499.png' },
    { min: 1500, max: 1799, image: '300-4199/1500-1799.png' },
    { min: 1800, max: 2099, image: '300-4199/1800-2099.png' },
    { min: 2100, max: 2399, image: '300-4199/2100-2399.png' },
    { min: 2400, max: 2699, image: '300-4199/2400-2699.png' },
    { min: 2700, max: 2999, image: '300-4199/2700-2999.png' },
    { min: 3000, max: 3299, image: '300-4199/3000-3299.png' },
    { min: 3300, max: 3599, image: '300-4199/3300-3599.png' },
    { min: 3600, max: 3899, image: '300-4199/3600-3899.png' },
    { min: 3900, max: 4199, image: '300-4199/3900-4199.png' }
  ];
  
  // 轉換為數字確保比較正確
  const power = parseInt(totalPower) || 0;
  
  // 查找對應的範圍
  const range = powerRanges.find(r => power >= r.min && power <= r.max);
  
  if (range) {
    return `${baseUrl}/${range.image}`;
  }
  
  // 超出範圍的情況
  if (power < 300) {
    return `${baseUrl}/party-placeholder.png`; // 戰力太低，使用占位圖
  } else if (power > 4199) {
    return `${baseUrl}/300-4199/3900-4199.png`; // 戰力超高，使用最高級圖片
  }
  
  // 默認圖片
  return `${baseUrl}/party.png`;
}

/**
 * 根據戰力範圍獲取 Party 等級描述
 * @param {number} totalPower - 總戰力值
 * @returns {string} 等級描述
 */
function getPartyTierByPower(totalPower) {
  const power = parseInt(totalPower) || 0;
  
  if (power < 300) return 'Novice';
  else if (power < 600) return 'Apprentice';
  else if (power < 900) return 'Journeyman';
  else if (power < 1200) return 'Expert';
  else if (power < 1500) return 'Master';
  else if (power < 1800) return 'Grandmaster';
  else if (power < 2100) return 'Champion';
  else if (power < 2400) return 'Hero';
  else if (power < 2700) return 'Legend';
  else if (power < 3000) return 'Mythic';
  else if (power < 3300) return 'Divine';
  else if (power < 3600) return 'Eternal';
  else if (power < 3900) return 'Transcendent';
  else return 'Godlike';
}

module.exports = {
  getPartyImageByPower,
  getPartyTierByPower
};