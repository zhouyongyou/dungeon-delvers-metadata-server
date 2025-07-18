// ElementAdapter.js - Element Market Specific Adapter

const { MarketplaceAdapter } = require('./MarketplaceAdapter');

class ElementAdapter extends MarketplaceAdapter {
  constructor(metadata, options = {}) {
    super(metadata);
    this.type = options.type || 'unknown';
    this.tokenId = options.tokenId || '0';
    this.contractAddress = options.contractAddress || '';
    this.frontendDomain = options.frontendDomain || 'https://dungeondelvers.xyz';
  }

  /**
   * Element Market specific metadata adaptation
   * Element prefers:
   * - String format for display but numeric values for filtering
   * - Rich attribute display with trait_count
   * - Supports both image and image_url fields
   * - Prefers detailed collection metadata
   */
  adapt() {
    // Ensure attributes exist
    if (!this.metadata.attributes) {
      this.metadata.attributes = [];
    }

    // Process each attribute for Element's dual format preference
    this.metadata.attributes = this.metadata.attributes.map(attr => {
      const adapted = { ...attr };

      // Handle Rarity - Element likes both formats
      if (attr.trait_type === 'Rarity') {
        const numericValue = this.normalizeRarity(attr.value);
        adapted.value = numericValue;
        adapted.display_type = 'number';
        
        // Add display value for Element's UI
        adapted.display_value = this.getRarityDisplayName(numericValue);
      }
      
      // Handle other numeric attributes
      else if (this.isNumericAttribute(attr.trait_type)) {
        adapted.value = this.ensureNumeric(attr.value, 0);
        adapted.display_type = 'number';
      }
      
      return adapted;
    });

    // Add trait count for Element's filtering system
    this.metadata.trait_count = this.metadata.attributes.length;

    // Ensure Token ID is present
    const hasTokenId = this.metadata.attributes.some(attr => attr.trait_type === 'Token ID');
    if (!hasTokenId && this.tokenId) {
      this.metadata.attributes.push({
        trait_type: 'Token ID',
        value: parseInt(this.tokenId),
        display_type: 'number'
      });
    }

    // Element supports both image and image_url
    this.metadata.image = this.ensureHttpsUrl(this.metadata.image, this.frontendDomain);
    this.metadata.image_url = this.metadata.image; // Redundancy for compatibility

    // Add external_url
    if (!this.metadata.external_url) {
      this.metadata.external_url = `${this.frontendDomain}/nft/${this.type}/${this.tokenId}`;
    }

    // Element specific collection metadata
    this.metadata.collection = {
      name: 'Dungeon Delvers',
      description: 'A blockchain-based dungeon crawler NFT collection on BSC',
      external_link: this.frontendDomain,
      image: `${this.frontendDomain}/images/collection-banner.png`
    };

    // Add Element specific fields
    this.metadata.element_optimized = true;
    this.metadata.marketplace_compatibility = 'element';

    // Element likes to show token standard
    this.metadata.token_standard = 'ERC721';
    this.metadata.chain = 'BSC';

    // Background color for Element's UI
    if (!this.metadata.background_color) {
      this.metadata.background_color = '1a1a2e'; // Dark theme color
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
   * Get display name for rarity
   * @param {number} rarity 
   * @returns {string}
   */
  getRarityDisplayName(rarity) {
    const rarityNames = {
      1: 'Common',
      2: 'Rare',
      3: 'Epic',
      4: 'Legendary',
      5: 'Mythic'
    };
    return rarityNames[rarity] || 'Common';
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
    if (!this.metadata.image && !this.metadata.image_url) errors.push('Missing image');
    
    // Check optional but recommended fields
    if (!this.metadata.description) warnings.push('Missing description');
    if (!this.metadata.trait_count) warnings.push('Missing trait_count');

    // Check image URLs
    if (this.metadata.image && !this.metadata.image.startsWith('https://')) {
      warnings.push('Image URL should be HTTPS for best compatibility');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

module.exports = { ElementAdapter };