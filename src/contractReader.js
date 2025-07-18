// 直接從智能合約讀取 NFT 資料的模組
const { ethers } = require('ethers');

// BSC RPC
const BSC_RPC = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/';

// 合約地址 - 優先使用環境變數 (V3 - 2025-01-18)
const CONTRACTS = {
  hero: process.env.VITE_MAINNET_HERO_ADDRESS || '0x99658b9Aa55BFD3a8bd465c77DcCa6b1E7741dA3',
  relic: process.env.VITE_MAINNET_RELIC_ADDRESS || '0xF3e8546216cFdB2F0A1E886291385785177ba773',
  party: process.env.VITE_MAINNET_PARTY_ADDRESS || '0xddCFa681Cee80D3a0F23834cC07D371792207C85'
};

// 簡化的 ABI - 只包含我們需要的函數
const HERO_ABI = [
  'function getHeroProperties(uint256 tokenId) view returns (uint8 rarity, uint256 power)',
  'function heroData(uint256 tokenId) view returns (uint8 rarity, uint256 power)'
];

const RELIC_ABI = [
  'function getRelicProperties(uint256 tokenId) view returns (uint8 rarity, uint8 capacity)',
  'function relicData(uint256 tokenId) view returns (uint8 rarity, uint8 capacity)'
];

const PARTY_ABI = [
  'function getPartyComposition(uint256 partyId) view returns (tuple(uint256 heroId, uint256 relicId, uint8 partyRarity, uint256 totalPower, uint16 totalCapacity))',
  'function partyCompositions(uint256 partyId) view returns (uint256 heroId, uint256 relicId, uint8 partyRarity, uint256 totalPower, uint16 totalCapacity)'
];

// 創建 provider
const provider = new ethers.providers.JsonRpcProvider(BSC_RPC);

// 創建合約實例
const contracts = {
  hero: new ethers.Contract(CONTRACTS.hero, HERO_ABI, provider),
  relic: new ethers.Contract(CONTRACTS.relic, RELIC_ABI, provider),
  party: new ethers.Contract(CONTRACTS.party, PARTY_ABI, provider)
};

/**
 * 從合約讀取 NFT 稀有度
 * @param {string} type - NFT 類型 (hero/relic/party)
 * @param {string|number} tokenId - Token ID
 * @returns {Promise<number|null>} 稀有度 (1-5) 或 null
 */
async function getRarityFromContract(type, tokenId) {
  try {
    const contract = contracts[type];
    if (!contract) {
      console.error(`未知的 NFT 類型: ${type}`);
      return null;
    }

    console.log(`從合約讀取 ${type} #${tokenId} 的稀有度...`);

    switch (type) {
      case 'hero': {
        try {
          const properties = await contract.getHeroProperties(tokenId);
          const rarity = parseInt(properties.rarity);
          console.log(`Hero #${tokenId} 合約稀有度: ${rarity}`);
          return rarity;
        } catch (error) {
          // 如果 getHeroProperties 失敗，嘗試直接讀取 mapping
          const data = await contract.heroData(tokenId);
          const rarity = parseInt(data.rarity);
          console.log(`Hero #${tokenId} 合約稀有度 (from mapping): ${rarity}`);
          return rarity;
        }
      }

      case 'relic': {
        try {
          const properties = await contract.getRelicProperties(tokenId);
          const rarity = parseInt(properties.rarity);
          console.log(`Relic #${tokenId} 合約稀有度: ${rarity}`);
          return rarity;
        } catch (error) {
          // 如果 getRelicProperties 失敗，嘗試直接讀取 mapping
          const data = await contract.relicData(tokenId);
          const rarity = parseInt(data.rarity);
          console.log(`Relic #${tokenId} 合約稀有度 (from mapping): ${rarity}`);
          return rarity;
        }
      }

      case 'party': {
        try {
          const composition = await contract.getPartyComposition(tokenId);
          const rarity = parseInt(composition.partyRarity || composition[2]);
          console.log(`Party #${tokenId} 合約稀有度: ${rarity}`);
          return rarity;
        } catch (error) {
          // 如果 getPartyComposition 失敗，嘗試直接讀取 mapping
          const data = await contract.partyCompositions(tokenId);
          const rarity = parseInt(data.partyRarity || data[2]);
          console.log(`Party #${tokenId} 合約稀有度 (from mapping): ${rarity}`);
          return rarity;
        }
      }

      default:
        return null;
    }
  } catch (error) {
    console.error(`從合約讀取 ${type} #${tokenId} 失敗:`, error.message);
    
    // 如果是 token 不存在的錯誤，返回 null 而不是拋出錯誤
    if (error.message.includes('nonexistent token') || 
        error.message.includes('invalid token') ||
        error.code === 'CALL_EXCEPTION') {
      console.log(`${type} #${tokenId} 不存在`);
      return null;
    }
    
    throw error;
  }
}

/**
 * 批量讀取稀有度（優化版本）
 * @param {string} type - NFT 類型
 * @param {Array<string|number>} tokenIds - Token ID 陣列
 * @returns {Promise<Object>} tokenId -> rarity 的映射
 */
async function getBatchRarityFromContract(type, tokenIds) {
  const results = {};
  
  // 使用 Promise.allSettled 避免單個失敗影響整體
  const promises = tokenIds.map(async (tokenId) => {
    try {
      const rarity = await getRarityFromContract(type, tokenId);
      return { tokenId, rarity };
    } catch (error) {
      console.error(`批量讀取失敗 ${type} #${tokenId}:`, error.message);
      return { tokenId, rarity: null };
    }
  });
  
  const settled = await Promise.allSettled(promises);
  
  settled.forEach((result) => {
    if (result.status === 'fulfilled' && result.value) {
      results[result.value.tokenId] = result.value.rarity;
    }
  });
  
  return results;
}

module.exports = {
  getRarityFromContract,
  getBatchRarityFromContract,
  CONTRACTS
};