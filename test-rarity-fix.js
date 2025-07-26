// 測試稀有度修復
const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3001';

async function testMetadata(type, tokenIds) {
  console.log(`\n測試 ${type.toUpperCase()} NFT 元數據:`);
  console.log('='.repeat(50));
  
  const rarityCount = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  
  for (const tokenId of tokenIds) {
    try {
      const response = await axios.get(`${BASE_URL}/metadata/${type}/${tokenId}`);
      const metadata = response.data;
      
      // 提取稀有度
      const rarityAttr = metadata.attributes?.find(attr => attr.trait_type === 'Rarity');
      let rarity = 1;
      
      if (rarityAttr) {
        // 將文字稀有度轉換為數字
        const rarityMap = {
          'Common': 1,
          'Uncommon': 2,
          'Rare': 3,
          'Epic': 4,
          'Legendary': 5
        };
        rarity = rarityMap[rarityAttr.value] || 1;
      }
      
      rarityCount[rarity]++;
      
      console.log(`${type} #${tokenId}: ${metadata.name} - 稀有度: ${rarity} (${rarityAttr?.value || 'Unknown'})`);
    } catch (error) {
      console.error(`❌ ${type} #${tokenId}: ${error.message}`);
    }
  }
  
  // 顯示統計
  console.log('\n稀有度分布:');
  for (let r = 1; r <= 5; r++) {
    const percentage = (rarityCount[r] / tokenIds.length * 100).toFixed(1);
    console.log(`${r}星: ${rarityCount[r]} (${percentage}%)`);
  }
}

async function runTests() {
  console.log('🧪 測試 NFT 元數據稀有度分布');
  console.log(`API URL: ${BASE_URL}`);
  
  // 測試不同範圍的 tokenId
  const heroIds = [1, 100, 500, 1000, 2000, 3000, 5000, 7500, 10000, 15000];
  const relicIds = [1, 50, 200, 500, 1000, 2000, 3000, 5000];
  const partyIds = [1, 50, 100, 300, 500, 1000, 1500, 2000];
  
  await testMetadata('hero', heroIds);
  await testMetadata('relic', relicIds);
  await testMetadata('party', partyIds);
  
  console.log('\n✅ 測試完成！');
}

// 執行測試
runTests().catch(console.error);