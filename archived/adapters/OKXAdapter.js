// OKXAdapter.js - OKX NFT Marketplace Specific Adapter

const { MarketplaceAdapter } = require('./MarketplaceAdapter');

class OKXAdapter extends MarketplaceAdapter {
  constructor(metadata, options = {}) {
    super(metadata);
    this.type = options.type || 'unknown';
    this.tokenId = options.tokenId || '0';
    this.contractAddress = options.contractAddress || '';
    this.frontendDomain = options.frontendDomain || 'https://dungeondelvers.xyz';
  }

  /**
   * OKX specific metadata adaptation
   * OKX requires:
   * - Numeric values for Rarity and other number attributes
   * - HTTPS URLs only
   * - Proper display_type for numeric attributes
   * - external_url for NFT detail page
   */
  adapt() {
    // Ensure attributes exist
    if (!this.metadata.attributes) {
      this.metadata.attributes = [];
    }

    // Process each attribute
    this.metadata.attributes = this.metadata.attributes.map(attr => {
      const adapted = { ...attr };

      // Handle Rarity - MUST be numeric for OKX
      if (attr.trait_type === 'Rarity') {
        // 如果稀有度為 null 或 undefined，不包含此屬性
        if (attr.value === null || attr.value === undefined || attr.value === 'Unknown') {
          return null; // 將在後面過濾掉
        }
        adapted.value = this.normalizeRarity(attr.value);
        adapted.display_type = 'number';
        
        // Add max_value for rarity to help with filtering
        adapted.max_value = 5;
      }
      
      // Handle other numeric attributes
      else if (this.isNumericAttribute(attr.trait_type)) {
        adapted.value = this.ensureNumeric(attr.value, 0);
        adapted.display_type = 'number';
        
        // Add specific max values for known attributes
        if (attr.trait_type === 'Power' || attr.trait_type === 'Capacity') {
          adapted.max_value = 9999; // Adjust based on your game's max values
        }
      }
      
      // Keep string attributes as-is
      return adapted;
    }).filter(attr => attr !== null); // 過濾掉 null 值

    // Ensure Token ID is present and numeric
    const hasTokenId = this.metadata.attributes.some(attr => attr.trait_type === 'Token ID');
    if (!hasTokenId && this.tokenId) {
      this.metadata.attributes.push({
        trait_type: 'Token ID',
        value: parseInt(this.tokenId),
        display_type: 'number'
      });
    }

    // 如果沒有稀有度，添加狀態說明
    const hasRarity = this.metadata.attributes.some(attr => attr.trait_type === 'Rarity');
    if (!hasRarity) {
      this.metadata.attributes.push({
        trait_type: 'Status',
        value: 'Data Syncing',
        display_type: 'string'
      });
      
      // 添加 BSC 鏈標識
      this.metadata.attributes.push({
        trait_type: 'Chain',
        value: 'BSC',
        display_type: 'string'
      });
    }
    
    // Ensure HTTPS image URL
    this.metadata.image = this.ensureHttpsUrl(this.metadata.image, this.frontendDomain);
    
    // 占位圖片已經是正確的路徑，不需要特別修改
    // 例如：/images/hero/hero-placeholder.png

    // Add external_url for OKX detail page navigation
    if (!this.metadata.external_url) {
      this.metadata.external_url = `${this.frontendDomain}/nft/${this.type}/${this.tokenId}`;
    }

    // Add animation_url if applicable (for future animated NFTs)
    if (this.metadata.animation_url) {
      this.metadata.animation_url = this.ensureHttpsUrl(this.metadata.animation_url, this.frontendDomain);
    }

    // OKX specific metadata fields
    this.metadata.okx_optimized = true;
    this.metadata.marketplace_compatibility = 'okx';
    
    // Ensure proper encoding for OKX
    this.metadata.charset = 'UTF-8';

    // Add collection info if missing
    if (!this.metadata.collection) {
      this.metadata.collection = {
        name: 'Dungeon Delvers',
        family: 'Dungeon Delvers NFT'
      };
    }

    // Keep original name - don't override
    // OKX can handle any reasonable name format
    // This preserves placeholder names like "Unknown Hero"

    return this.metadata;
  }

  /**
   * Check if attribute should be numeric
   * @param {string} traitType 
   * @returns {boolean}
   */
  isNumericAttribute(traitType) {
    const numericTraits = [
      'Power', 'Capacity', 'Total Power', 'Total Capacity',
      'Token ID', 'Heroes Count', 'Level', 'Experience'
    ];
    return numericTraits.includes(traitType);
  }

  /**
   * Validate the adapted metadata
   * @returns {object} Validation result
   */
  validate() {
    const errors = [];
    const warnings = [];

    // Check required fields
    if (!this.metadata.name) errors.push('Missing name');
    if (!this.metadata.image) errors.push('Missing image');
    if (!this.metadata.description) warnings.push('Missing description');

    // Check image URL
    if (this.metadata.image && !this.metadata.image.startsWith('https://')) {
      errors.push('Image URL must be HTTPS');
    }

    // Check attributes
    if (this.metadata.attributes && Array.isArray(this.metadata.attributes)) {
      const rarityAttr = this.metadata.attributes.find(attr => attr.trait_type === 'Rarity');
      if (!rarityAttr) {
        warnings.push('Missing Rarity attribute');
      } else if (typeof rarityAttr.value !== 'number') {
        errors.push('Rarity value must be numeric');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

module.exports = { OKXAdapter };