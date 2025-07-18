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
    });

    // Ensure Token ID is present and numeric
    const hasTokenId = this.metadata.attributes.some(attr => attr.trait_type === 'Token ID');
    if (!hasTokenId && this.tokenId) {
      this.metadata.attributes.push({
        trait_type: 'Token ID',
        value: parseInt(this.tokenId),
        display_type: 'number'
      });
    }

    // Ensure HTTPS image URL
    this.metadata.image = this.ensureHttpsUrl(this.metadata.image, this.frontendDomain);

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

    // Add collection info if missing
    if (!this.metadata.collection) {
      this.metadata.collection = {
        name: 'Dungeon Delvers',
        family: 'Dungeon Delvers NFT'
      };
    }

    // Ensure name doesn't have problematic characters
    if (this.metadata.name) {
      // OKX sometimes has issues with special Unicode characters
      this.metadata.name = this.metadata.name.replace(/[^\x00-\x7F]+/g, (match) => {
        // Keep stars but remove other non-ASCII
        return match === '★' ? match : '';
      });
    }

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