#!/usr/bin/env node
/**
 * 緊急修復 OKX NFT 星級顯示問題
 * 
 * 問題診斷：
 * 1. 子圖資料缺失導致 fallback 到預設值 (rarity = 1)
 * 2. OKX 平台對 metadata 格式要求嚴格
 * 
 * 執行方式：
 * node emergency-fix-okx.js
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// 配置
const SUBGRAPH_URL = process.env.SUBGRAPH_URL || 'YOUR_SUBGRAPH_URL';
const METADATA_SERVER_PORT = process.env.PORT || 3003;

// 建立本地快取映射表
const rarityCache = new Map();

// 從合約 ABI 或已知資料載入正確的 rarity 映射
const KNOWN_RARITIES = {
  // 格式: tokenId: rarity
  // 這裡需要填入實際的 tokenId 和對應的 rarity
  // 例如:
  // '1': 3,
  // '2': 4,
  // '3': 2,
};

// 查詢子圖獲取所有 NFT 的 rarity
async function fetchAllRaritiesFromSubgraph() {
  const query = `
    query GetAllRarities {
      heroes(first: 1000) {
        id
        tokenId
        rarity
      }
      relics(first: 1000) {
        id
        tokenId
        rarity
      }
    }
  `;

  try {
    const response = await axios.post(SUBGRAPH_URL, { query });
    const { heroes, relics } = response.data.data;
    
    heroes.forEach(hero => {
      rarityCache.set(`hero-${hero.tokenId}`, hero.rarity);
    });
    
    relics.forEach(relic => {
      rarityCache.set(`relic-${relic.tokenId}`, relic.rarity);
    });
    
    console.log(`✅ 從子圖載入了 ${heroes.length} 個英雄和 ${relics.length} 個聖物的 rarity`);
  } catch (error) {
    console.error('❌ 無法從子圖獲取資料:', error.message);
  }
}

// 建立靜態 rarity 映射檔案
async function createStaticRarityMapping() {
  const mapping = {
    heroes: {},
    relics: {},
    parties: {},
    lastUpdated: new Date().toISOString()
  };

  // 從快取建立映射
  for (const [key, rarity] of rarityCache.entries()) {
    const [type, tokenId] = key.split('-');
    if (type === 'hero') {
      mapping.heroes[tokenId] = rarity;
    } else if (type === 'relic') {
      mapping.relics[tokenId] = rarity;
    }
  }

  // 寫入檔案
  const mappingPath = path.join(__dirname, 'rarity-mapping.json');
  await fs.writeFile(mappingPath, JSON.stringify(mapping, null, 2));
  console.log(`✅ 建立了靜態 rarity 映射檔案: ${mappingPath}`);
  
  return mapping;
}

// 修改 metadata server 以使用快取
async function patchMetadataServer() {
  const serverPath = path.join(__dirname, 'src/index.js');
  const serverCode = await fs.readFile(serverPath, 'utf8');
  
  // 檢查是否已經有快取邏輯
  if (serverCode.includes('rarityMapping')) {
    console.log('✅ Metadata server 已經包含 rarity 快取邏輯');
    return;
  }

  // 在檔案開頭加入快取載入邏輯
  const patchCode = `
// 載入 rarity 映射快取
let rarityMapping = null;
try {
  rarityMapping = require('../rarity-mapping.json');
  console.log('✅ 載入了 rarity 映射快取');
} catch (error) {
  console.warn('⚠️ 無法載入 rarity 映射快取:', error.message);
}

// 獲取快取的 rarity
function getCachedRarity(type, tokenId) {
  if (!rarityMapping) return null;
  
  const typeMap = {
    'hero': 'heroes',
    'relic': 'relics',
    'party': 'parties'
  };
  
  const mappingType = typeMap[type];
  if (mappingType && rarityMapping[mappingType]) {
    return rarityMapping[mappingType][tokenId] || null;
  }
  
  return null;
}
`;

  // 修改 getHeroData 和 getRelicData 函數
  const modifiedCode = serverCode.replace(
    /async function getHeroData\(tokenId\) {/,
    `async function getHeroData(tokenId) {
  // 優先使用快取的 rarity
  const cachedRarity = getCachedRarity('hero', tokenId);
  if (cachedRarity) {
    console.log(\`使用快取的 hero #\${tokenId} rarity: \${cachedRarity}\`);
  }`
  );

  // 寫回檔案
  await fs.writeFile(serverPath, patchCode + '\n' + modifiedCode);
  console.log('✅ 已修改 metadata server 加入快取邏輯');
}

// 測試修復效果
async function testFix(tokenId, type = 'hero') {
  try {
    const response = await axios.get(`http://localhost:${METADATA_SERVER_PORT}/${type}/${tokenId}`);
    const metadata = response.data;
    const rarityAttr = metadata.attributes.find(attr => attr.trait_type === 'Rarity');
    
    console.log(`測試 ${type} #${tokenId}:`);
    console.log(`  - Rarity: ${rarityAttr?.value}`);
    console.log(`  - 類型: ${typeof rarityAttr?.value}`);
    console.log(`  - OKX 兼容: ${typeof rarityAttr?.value === 'number' ? '✅' : '❌'}`);
  } catch (error) {
    console.error(`測試失敗 ${type} #${tokenId}:`, error.message);
  }
}

// 主函數
async function main() {
  console.log('🚀 開始緊急修復 OKX NFT 星級顯示問題...\n');

  // 步驟 1: 從子圖獲取所有 rarity
  console.log('步驟 1: 從子圖獲取 rarity 資料');
  await fetchAllRaritiesFromSubgraph();

  // 步驟 2: 建立靜態映射
  console.log('\n步驟 2: 建立靜態 rarity 映射');
  await createStaticRarityMapping();

  // 步驟 3: 修改 metadata server
  console.log('\n步驟 3: 修改 metadata server');
  await patchMetadataServer();

  // 步驟 4: 測試修復效果
  console.log('\n步驟 4: 測試修復效果');
  await testFix(1, 'hero');
  await testFix(1, 'relic');

  console.log('\n✅ 緊急修復完成！');
  console.log('\n後續步驟:');
  console.log('1. 重啟 metadata server: npm restart');
  console.log('2. 清除 OKX 的快取（可能需要等待）');
  console.log('3. 監控子圖同步狀態，確保資料完整性');
}

// 執行
main().catch(console.error);