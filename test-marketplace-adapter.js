// test-marketplace-adapter.js - Test script for marketplace adapters

const axios = require('axios');

const TEST_CONFIG = {
  baseUrl: 'http://localhost:3001',
  testTokens: [
    { type: 'hero', tokenId: '1' },
    { type: 'relic', tokenId: '42' },
    { type: 'party', tokenId: '10' }
  ]
};

async function testMarketplaceAdapter(marketplace, headers) {
  console.log(`\n🧪 Testing ${marketplace} adapter...`);
  console.log('Headers:', JSON.stringify(headers, null, 2));
  
  for (const token of TEST_CONFIG.testTokens) {
    try {
      const url = `${TEST_CONFIG.baseUrl}/api/${token.type}/${token.tokenId}`;
      console.log(`\n📡 Fetching ${token.type} #${token.tokenId}`);
      
      const response = await axios.get(url, { headers });
      const metadata = response.data;
      
      // Check adapter was applied
      if (metadata.marketplace_compatibility) {
        console.log(`✅ Adapter applied: ${metadata.marketplace_compatibility}`);
      }
      
      // Validate key fields
      console.log(`Name: ${metadata.name}`);
      console.log(`Image: ${metadata.image}`);
      
      // Check rarity
      const rarityAttr = metadata.attributes?.find(attr => attr.trait_type === 'Rarity');
      if (rarityAttr) {
        console.log(`Rarity: ${rarityAttr.value} (type: ${typeof rarityAttr.value})`);
        if (rarityAttr.display_type) {
          console.log(`Display Type: ${rarityAttr.display_type}`);
        }
        if (rarityAttr.display_value) {
          console.log(`Display Value: ${rarityAttr.display_value}`);
        }
      }
      
      // Marketplace specific checks
      if (marketplace === 'okx' && metadata.okx_optimized) {
        console.log('✅ OKX optimization applied');
      }
      if (marketplace === 'element' && metadata.element_optimized) {
        console.log('✅ Element optimization applied');
        if (metadata.trait_count) {
          console.log(`Trait Count: ${metadata.trait_count}`);
        }
      }
      
    } catch (error) {
      console.error(`❌ Error testing ${token.type} #${token.tokenId}:`, error.message);
    }
  }
}

async function runTests() {
  console.log('🚀 Starting marketplace adapter tests...\n');
  
  // Test OKX adapter
  await testMarketplaceAdapter('okx', {
    'user-agent': 'OKX-NFT-Bot/1.0',
    'referer': 'https://www.okx.com/web3/marketplace/nft'
  });
  
  // Test Element adapter
  await testMarketplaceAdapter('element', {
    'user-agent': 'Mozilla/5.0 Element-Market',
    'referer': 'https://element.market/assets'
  });
  
  // Test default (no specific marketplace)
  await testMarketplaceAdapter('default', {
    'user-agent': 'Mozilla/5.0'
  });
  
  console.log('\n✅ Tests completed!');
}

// Run tests
runTests().catch(console.error);