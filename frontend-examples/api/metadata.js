// frontend-examples/api/metadata.js
// Dungeon Delvers NFT Metadata API Service

const API_BASE_URL = process.env.VITE_API_BASE_URL || 'https://api.dungeondelvers.xyz';

class MetadataService {
  /**
   * 獲取Hero NFT元數據
   */
  async getHeroMetadata(tokenId) {
    const response = await fetch(`${API_BASE_URL}/api/hero/${tokenId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch hero metadata: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * 獲取Relic NFT元數據
   */
  async getRelicMetadata(tokenId) {
    const response = await fetch(`${API_BASE_URL}/api/relic/${tokenId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch relic metadata: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * 獲取Party NFT元數據
   */
  async getPartyMetadata(tokenId) {
    const response = await fetch(`${API_BASE_URL}/api/party/${tokenId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch party metadata: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * 獲取Profile NFT元數據
   * ❌ 修改前：/api/playerprofile/${tokenId}
   * ✅ 修改後：/api/profile/${tokenId}
   */
  async getProfileMetadata(tokenId) {
    // ✅ 已修復：使用新的統一路由
    const response = await fetch(`${API_BASE_URL}/api/profile/${tokenId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch profile metadata: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * 獲取VIP NFT元數據
   * ❌ 修改前：/api/vipstaking/${tokenId}
   * ✅ 修改後：/api/vip/${tokenId}
   */
  async getVipMetadata(tokenId) {
    // ✅ 已修復：使用新的統一路由
    const response = await fetch(`${API_BASE_URL}/api/vip/${tokenId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch VIP metadata: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * 批量獲取NFT元數據
   */
  async getBatchMetadata(requests) {
    const promises = requests.map(({ type, tokenId }) => {
      switch (type) {
        case 'hero':
          return this.getHeroMetadata(tokenId);
        case 'relic':
          return this.getRelicMetadata(tokenId);
        case 'party':
          return this.getPartyMetadata(tokenId);
        case 'profile':
          return this.getProfileMetadata(tokenId);
        case 'vip':
          return this.getVipMetadata(tokenId);
        default:
          return Promise.reject(new Error(`Unknown NFT type: ${type}`));
      }
    });

    return Promise.allSettled(promises);
  }

  /**
   * 檢查伺服器健康狀態
   */
  async checkHealth() {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }
    return response.json();
  }
}

// 舊版本的API調用（需要修改）
class LegacyMetadataService {
  /**
   * ❌ 舊版本 - 需要修改的VIP API調用
   */
  async getVipMetadataOld(tokenId) {
    // ❌ 這個會產生404錯誤
    const response = await fetch(`${API_BASE_URL}/api/vipstaking/${tokenId}`);
    return response.json();
  }

  /**
   * ❌ 舊版本 - 需要修改的Profile API調用
   */
  async getProfileMetadataOld(tokenId) {
    // ❌ 這個會產生404錯誤
    const response = await fetch(`${API_BASE_URL}/api/playerprofile/${tokenId}`);
    return response.json();
  }
}

export default new MetadataService();