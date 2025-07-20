// 測試圖片 URL 是否為絕對 HTTPS 路徑

const axios = require('axios');

// 元數據服務器 URL
const METADATA_SERVER = 'https://dungeon-delvers-metadata-server.onrender.com';

// 測試不同類型的 NFT
const testCases = [
  { type: 'hero', tokenId: '1' },
  { type: 'hero', tokenId: '100' },
  { type: 'relic', tokenId: '1' },
  { type: 'relic', tokenId: '50' },
  { type: 'party', tokenId: '1' },
  { type: 'vip', tokenId: '1' },
];

async function testImageUrls() {
  console.log('🔍 測試 NFT 元數據圖片 URL 格式\n');
  
  for (const { type, tokenId } of testCases) {
    try {
      console.log(`📦 測試 ${type} #${tokenId}:`);
      
      const url = `${METADATA_SERVER}/api/${type}/${tokenId}`;
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'DungeonDelvers-Test/1.0',
        }
      });
      
      const metadata = response.data;
      
      if (metadata.image) {
        console.log(`  圖片 URL: ${metadata.image}`);
        
        // 檢查是否為絕對 HTTPS URL
        if (metadata.image.startsWith('https://')) {
          console.log(`  ✅ 正確：絕對 HTTPS URL`);
        } else if (metadata.image.startsWith('http://')) {
          console.log(`  ❌ 錯誤：使用 HTTP 而非 HTTPS`);
        } else if (metadata.image.startsWith('/')) {
          console.log(`  ❌ 錯誤：相對 URL`);
        } else {
          console.log(`  ⚠️  警告：非標準 URL 格式`);
        }
        
        // 檢查 URL 結構
        try {
          const urlObj = new URL(metadata.image);
          console.log(`  域名: ${urlObj.hostname}`);
          console.log(`  路徑: ${urlObj.pathname}`);
        } catch (e) {
          console.log(`  ❌ 無效的 URL 格式`);
        }
      } else {
        console.log(`  ❌ 沒有圖片 URL`);
      }
      
      // 檢查稀有度屬性
      const rarityAttr = metadata.attributes?.find(attr => 
        attr.trait_type === 'Rarity' || 
        attr.trait_type === 'Star Rating' || 
        attr.trait_type === 'Stars'
      );
      
      if (rarityAttr) {
        console.log(`  稀有度: ${rarityAttr.value} (類型: ${typeof rarityAttr.value})`);
        if (typeof rarityAttr.value !== 'number') {
          console.log(`  ⚠️  警告：稀有度不是數字類型`);
        }
      }
      
      console.log('');
      
    } catch (error) {
      console.error(`  ❌ 錯誤: ${error.message}`);
      console.log('');
    }
  }
  
  console.log('\n📋 總結:');
  console.log('- 圖片 URL 應該使用 https://dungeondelvers.xyz/images/ 格式');
  console.log('- 稀有度應該是數字類型（1-5）');
  console.log('- 所有屬性應該有正確的 trait_type 和 value');
}

// 測試 OKX 兼容性
async function testOKXCompatibility() {
  console.log('\n🔍 測試 OKX 兼容性\n');
  
  try {
    const response = await axios.get(`${METADATA_SERVER}/api/hero/1/debug?marketplace=okx`, {
      timeout: 10000,
    });
    
    const data = response.data;
    
    console.log('原始元數據:');
    console.log(JSON.stringify(data.original, null, 2));
    
    console.log('\nOKX 適配後:');
    console.log(JSON.stringify(data.adapted, null, 2));
    
    console.log('\n差異:');
    console.log(JSON.stringify(data.differences, null, 2));
    
  } catch (error) {
    console.error('測試失敗:', error.message);
  }
}

// 執行測試
async function runTests() {
  await testImageUrls();
  await testOKXCompatibility();
}

runTests()
  .then(() => {
    console.log('\n✅ 測試完成');
  })
  .catch(error => {
    console.error('\n❌ 測試失敗:', error);
  });