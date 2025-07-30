// MarketplaceAdapter.js - NFT Marketplace Compatibility Layer

class MarketplaceAdapter {
  constructor(metadata) {
    this.metadata = JSON.parse(JSON.stringify(metadata)); // Deep copy
  }

  /**
   * Base adapter method - should be overridden by specific marketplace adapters
   * @returns {object} Adapted metadata
   */
  adapt() {
    return this.metadata;
  }

  /**
   * Common utility to ensure numeric values
   * @param {*} value - Value to convert
   * @param {number} defaultValue - Default if conversion fails
   * @returns {number}
   */
  ensureNumeric(value, defaultValue = 0) {
    const num = parseInt(value);
    return !isNaN(num) ? num : defaultValue;
  }

  /**
   * Convert rarity string to number
   * @param {string|number} rarity 
   * @returns {number}
   */
  normalizeRarity(rarity) {
    if (typeof rarity === 'number') return Math.max(1, Math.min(5, rarity));
    
    const rarityMap = {
      'common': 1,
      'uncommon': 2,
      'rare': 2,
      'epic': 3,
      'legendary': 4,
      'mythic': 5,
      'mythical': 5
    };
    
    const normalized = rarityMap[String(rarity).toLowerCase()];
    return normalized || 1;
  }

  /**
   * Ensure HTTPS URLs
   * @param {string} url 
   * @param {string} baseUrl 
   * @returns {string}
   */
  ensureHttpsUrl(url, baseUrl = 'https://dungeondelvers.xyz') {
    if (!url) return '';
    
    if (url.startsWith('https://')) return url;
    if (url.startsWith('http://')) return url.replace('http://', 'https://');
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return baseUrl + url;
    
    return url;
  }

  /**
   * Get display type for attribute
   * @param {string} traitType 
   * @returns {string|undefined}
   */
  getDisplayType(traitType) {
    const numericTraits = [
      'Rarity', 'Power', 'Capacity', 'Total Power', 
      'Total Capacity', 'Token ID', 'Heroes Count'
    ];
    
    return numericTraits.includes(traitType) ? 'number' : undefined;
  }

  /**
   * Detect marketplace from User-Agent or Referer
   * @param {object} headers - Request headers
   * @returns {string|null} Detected marketplace
   */
  static detectMarketplace(headers) {
    const userAgent = (headers['user-agent'] || '').toLowerCase();
    const referer = (headers['referer'] || headers['referrer'] || '').toLowerCase();
    const origin = (headers['origin'] || '').toLowerCase();
    
    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Marketplace detection:', {
        userAgent: userAgent.substring(0, 100),
        referer: referer,
        origin: origin
      });
    }
    
    // Check User-Agent patterns
    if (userAgent.includes('okx') || userAgent.includes('okex')) return 'okx';
    if (userAgent.includes('element')) return 'element';
    if (userAgent.includes('opensea')) return 'opensea';
    
    // Check Referer patterns (more comprehensive)
    if (referer.includes('okx.com') || referer.includes('okex.com')) return 'okx';
    if (referer.includes('element.market') || referer.includes('element.market')) return 'element';
    if (referer.includes('opensea.io')) return 'opensea';
    
    // Check Origin header
    if (origin.includes('okx.com') || origin.includes('okex.com')) return 'okx';
    if (origin.includes('element.market')) return 'element';
    if (origin.includes('opensea.io')) return 'opensea';
    
    // Check for specific OKX crawler patterns
    if (userAgent.includes('okhttp') || userAgent.includes('okx-nft')) return 'okx';
    
    // Default to OKX for BSC chain (since it's the primary BSC NFT marketplace)
    return 'okx';
  }

  /**
   * Factory method to create appropriate adapter
   * @param {string} marketplace - Target marketplace
   * @param {object} metadata - NFT metadata
   * @param {object} options - Additional options
   * @returns {MarketplaceAdapter}
   */
  static create(marketplace, metadata, options = {}) {
    const { OKXAdapter } = require('./OKXAdapter');
    const { ElementAdapter } = require('./ElementAdapter');
    
    switch (marketplace) {
      case 'okx':
        return new OKXAdapter(metadata, options);
      case 'element':
        return new ElementAdapter(metadata, options);
      default:
        return new MarketplaceAdapter(metadata);
    }
  }
}

module.exports = { MarketplaceAdapter };