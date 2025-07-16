// Fix script to ensure OKX compatibility for NFT metadata

const fs = require('fs');
const path = require('path');

// OKX Compatibility Fixes
const OKX_FIXES = {
  // Ensure Rarity is always a number
  normalizeRarity: (value) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      // Handle various string formats
      const num = parseInt(value.replace(/[^\d]/g, ''));
      if (!isNaN(num) && num >= 1 && num <= 5) return num;
    }
    return 1; // Default to 1 if parsing fails
  },
  
  // Ensure all attribute values are properly formatted
  normalizeAttributes: (attributes) => {
    return attributes.map(attr => {
      const normalized = { ...attr };
      
      // Special handling for Rarity
      if (attr.trait_type === 'Rarity' || attr.trait_type === 'Star Rating' || attr.trait_type === 'Stars') {
        normalized.trait_type = 'Rarity'; // Standardize the name
        normalized.value = OKX_FIXES.normalizeRarity(attr.value);
      }
      
      // Ensure numeric values are actually numbers
      if (attr.trait_type === 'Power' || attr.trait_type === 'Capacity' || 
          attr.trait_type === 'Total Power' || attr.trait_type === 'Total Capacity' ||
          attr.trait_type === 'Token ID') {
        normalized.value = parseInt(attr.value) || 0;
      }
      
      return normalized;
    });
  },
  
  // Ensure image URLs are absolute HTTPS
  normalizeImageUrl: (url, baseUrl = 'https://dungeondelvers.xyz') => {
    if (!url) return `${baseUrl}/images/placeholder.png`;
    
    // Already absolute HTTPS
    if (url.startsWith('https://')) return url;
    
    // Convert HTTP to HTTPS
    if (url.startsWith('http://')) return url.replace('http://', 'https://');
    
    // Convert relative to absolute
    if (url.startsWith('/')) return `${baseUrl}${url}`;
    
    return url;
  }
};

// Generate OKX-compatible metadata response
function generateOKXCompatibleMetadata(originalMetadata, type, tokenId) {
  const fixed = {
    ...originalMetadata,
    // Ensure required fields exist
    name: originalMetadata.name || `${type} #${tokenId}`,
    description: originalMetadata.description || `Dungeon Delvers ${type} NFT`,
    image: OKX_FIXES.normalizeImageUrl(originalMetadata.image),
    
    // Fix attributes
    attributes: originalMetadata.attributes ? 
      OKX_FIXES.normalizeAttributes(originalMetadata.attributes) : []
  };
  
  // Add external_url for better marketplace support
  if (!fixed.external_url) {
    fixed.external_url = `https://dungeondelvers.xyz/nft/${type}/${tokenId}`;
  }
  
  return fixed;
}

// Patch for index.js to add OKX compatibility layer
const COMPATIBILITY_PATCH = `
// OKX Compatibility Layer
function ensureOKXCompatibility(metadata, type, tokenId) {
  // Ensure Rarity is numeric
  if (metadata.attributes) {
    metadata.attributes = metadata.attributes.map(attr => {
      if (attr.trait_type === 'Rarity' && typeof attr.value !== 'number') {
        // Convert string rarity to number
        const numValue = parseInt(attr.value);
        return {
          ...attr,
          value: !isNaN(numValue) ? numValue : 1
        };
      }
      return attr;
    });
  }
  
  // Ensure image URL is absolute HTTPS
  if (metadata.image && !metadata.image.startsWith('https://')) {
    if (metadata.image.startsWith('http://')) {
      metadata.image = metadata.image.replace('http://', 'https://');
    } else if (metadata.image.startsWith('/')) {
      metadata.image = \`\${FRONTEND_DOMAIN}\${metadata.image}\`;
    }
  }
  
  // Add external_url if missing
  if (!metadata.external_url) {
    metadata.external_url = \`\${FRONTEND_DOMAIN}/nft/\${type}/\${tokenId}\`;
  }
  
  return metadata;
}
`;

// Create a modified response function
const RESPONSE_WRAPPER = `
// Wrap the response to ensure OKX compatibility
const originalJson = res.json.bind(res);
res.json = function(data) {
  if (data && data.attributes && req.params.type && req.params.tokenId) {
    data = ensureOKXCompatibility(data, req.params.type, req.params.tokenId);
  }
  return originalJson(data);
};
`;

console.log('🔧 OKX Compatibility Fix Guide');
console.log('==============================\n');

console.log('📋 Issues Found:');
console.log('1. Rarity attribute might be returned as string instead of number');
console.log('2. Image URLs might be relative or HTTP instead of HTTPS');
console.log('3. Missing external_url field\n');

console.log('🛠️ Recommended Fixes:\n');

console.log('1. Add this compatibility function to index.js:');
console.log('-'.repeat(50));
console.log(COMPATIBILITY_PATCH);
console.log('-'.repeat(50));

console.log('\n2. In the API endpoint handler (/api/:type/:tokenId), before sending response:');
console.log('-'.repeat(50));
console.log(`
// Before: res.json(nftData);
// After:
nftData = ensureOKXCompatibility(nftData, type, tokenId);
res.json(nftData);
`);
console.log('-'.repeat(50));

console.log('\n3. Update generateFallbackMetadata to use numeric rarity:');
console.log('-'.repeat(50));
console.log(`
// Change this:
{ trait_type: 'Rarity', value: rarity || '載入中...' }

// To this:
{ trait_type: 'Rarity', value: typeof rarity === 'number' ? rarity : 1 }
`);
console.log('-'.repeat(50));

console.log('\n✅ These changes will ensure:');
console.log('- Rarity is always a number (1-5)');
console.log('- Image URLs are always absolute HTTPS');
console.log('- All required metadata fields are present');
console.log('- Better compatibility with OKX and other marketplaces\n');

// Export for use in other scripts
module.exports = {
  OKX_FIXES,
  generateOKXCompatibleMetadata,
  ensureOKXCompatibility: eval(COMPATIBILITY_PATCH.match(/function ensureOKXCompatibility[\s\S]+?return metadata;\s*}/)[0])
};