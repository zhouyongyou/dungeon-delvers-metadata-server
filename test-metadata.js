// Test script to verify metadata format for OKX compatibility
const axios = require('axios');

// Test configuration
const TEST_SERVER = 'http://localhost:3001';
const TEST_TOKENS = {
  hero: [1, 5, 10],
  relic: [1, 5, 10],
  party: [1, 5, 10]
};

// OpenSea metadata standard reference
const OPENSEA_STANDARD = {
  required: ['name', 'description', 'image'],
  optional: ['attributes', 'external_url', 'background_color', 'animation_url'],
  attributeFormat: {
    trait_type: 'string', // Should be string
    value: 'string|number', // Can be string or number
    display_type: 'string' // Optional, for special formatting
  }
};

// OKX specific requirements (based on common issues)
const OKX_REQUIREMENTS = {
  // OKX might expect star rating as a numeric value
  starRating: {
    expectedFormat: 'number', // 1, 2, 3, 4, 5
    commonIssues: [
      'String values like "1 star" or "★★★" might not parse correctly',
      'Values should be simple integers from 1-5',
      'Trait type should be consistent (e.g., "Rarity" not "Star Rating")'
    ]
  },
  // Image URLs must be absolute and HTTPS
  imageUrl: {
    mustBeHTTPS: true,
    mustBeAbsolute: true,
    commonIssues: [
      'Relative URLs will fail',
      'HTTP URLs might be blocked',
      'IPFS URLs need proper gateway'
    ]
  }
};

async function testMetadata(type, tokenId) {
  try {
    const url = `${TEST_SERVER}/api/${type}/${tokenId}`;
    console.log(`\n🔍 Testing ${type} #${tokenId}...`);
    console.log(`URL: ${url}`);
    
    const response = await axios.get(url);
    const metadata = response.data;
    
    console.log('\n📦 Metadata received:');
    console.log(JSON.stringify(metadata, null, 2));
    
    // Validate against OpenSea standard
    console.log('\n✅ OpenSea Standard Validation:');
    for (const field of OPENSEA_STANDARD.required) {
      if (metadata[field]) {
        console.log(`  ✓ ${field}: ${typeof metadata[field] === 'string' ? metadata[field].substring(0, 50) + '...' : 'present'}`);
      } else {
        console.log(`  ✗ ${field}: MISSING!`);
      }
    }
    
    // Check attributes format
    if (metadata.attributes && Array.isArray(metadata.attributes)) {
      console.log('\n🏷️ Attributes Analysis:');
      metadata.attributes.forEach((attr, index) => {
        console.log(`  [${index}] ${attr.trait_type}: ${attr.value} (${typeof attr.value})`);
        
        // Check for potential OKX issues
        if (attr.trait_type === 'Rarity' || attr.trait_type.toLowerCase().includes('star')) {
          console.log(`    ⚠️  Star/Rarity attribute found!`);
          if (typeof attr.value !== 'number') {
            console.log(`    ❌ WARNING: Value is not a number! OKX might have issues parsing this.`);
          }
          if (attr.value < 1 || attr.value > 5) {
            console.log(`    ❌ WARNING: Value ${attr.value} is outside expected range 1-5!`);
          }
        }
      });
    }
    
    // Check image URL
    if (metadata.image) {
      console.log('\n🖼️ Image URL Analysis:');
      const isHTTPS = metadata.image.startsWith('https://');
      const isAbsolute = metadata.image.startsWith('http');
      console.log(`  Protocol: ${isHTTPS ? '✓ HTTPS' : '✗ Not HTTPS'}`);
      console.log(`  Type: ${isAbsolute ? '✓ Absolute URL' : '✗ Relative URL'}`);
      console.log(`  URL: ${metadata.image}`);
    }
    
    return metadata;
  } catch (error) {
    console.error(`❌ Error testing ${type} #${tokenId}:`, error.message);
    return null;
  }
}

async function runTests() {
  console.log('🚀 Starting Dungeon Delvers Metadata Tests');
  console.log('=======================================\n');
  
  console.log('📋 Testing against:');
  console.log('- OpenSea Metadata Standard');
  console.log('- OKX Specific Requirements');
  console.log('- Common NFT Marketplace Compatibility\n');
  
  // Test each NFT type
  for (const [type, tokenIds] of Object.entries(TEST_TOKENS)) {
    console.log(`\n\n🎮 Testing ${type.toUpperCase()} NFTs`);
    console.log('='.repeat(40));
    
    for (const tokenId of tokenIds) {
      await testMetadata(type, tokenId);
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log('\n\n📊 Summary of Potential OKX Issues:');
  console.log('=====================================');
  console.log('1. Rarity/Star attributes should use numeric values (1-5)');
  console.log('2. Avoid string representations like "★★★" or "3 stars"');
  console.log('3. Use "Rarity" as trait_type consistently');
  console.log('4. Ensure all image URLs are absolute HTTPS URLs');
  console.log('5. Keep attribute values simple (avoid complex strings)');
  console.log('\n✅ Test complete!');
}

// Run tests if server is running
runTests().catch(console.error);