// OKX 優化建議

// 1. 修改市場優先順序（第 590 行附近）
const marketSources = [
  { name: 'okx', fetchFn: () => fetchFromOKX(type, tokenId, contractAddress) },
  // 移除或註解掉不再支援 BSC 的市場
  // { name: 'element', fetchFn: () => fetchFromElement(type, tokenId, contractAddress) },
  // { name: 'opensea', fetchFn: () => fetchFromOpenSea(type, tokenId, contractAddress) },
];

// 2. 簡化市場檢測邏輯
// 在 detectMarketplace 函數中，可以默認返回 'okx'
static detectMarketplace(headers) {
  const userAgent = (headers['user-agent'] || '').toLowerCase();
  const referer = (headers['referer'] || headers['referrer'] || '').toLowerCase();
  
  // OKX 檢測
  if (userAgent.includes('okx') || referer.includes('okx.com')) {
    return 'okx';
  }
  
  // 默認使用 OKX 適配器，因為是 BSC 上唯一的選擇
  return 'okx';
}

// 3. 優化 OKX 專用功能
// 在 OKXAdapter 中加強對 OKX 特定需求的支援
class OKXAdapter extends MarketplaceAdapter {
  adapt() {
    // ... 現有代碼 ...
    
    // 加入 OKX 特定的優化
    // 1. 確保稀有度顯示正確
    const rarityAttr = this.metadata.attributes.find(attr => attr.trait_type === 'Rarity');
    if (rarityAttr && rarityAttr.value === null) {
      // 如果沒有稀有度，移除該屬性而不是顯示 null
      this.metadata.attributes = this.metadata.attributes.filter(
        attr => attr.trait_type !== 'Rarity'
      );
      
      // 添加一個說明屬性
      this.metadata.attributes.push({
        trait_type: 'Status',
        value: 'Data Syncing',
        display_type: 'string'
      });
    }
    
    // 2. 優化圖片載入
    // OKX 可能會快取圖片，確保使用穩定的 URL
    if (this.metadata.image && this.metadata.image.includes('placeholder')) {
      // 使用 OKX 友好的占位圖
      this.metadata.image = `${this.frontendDomain}/images/okx-placeholder.png`;
    }
    
    // 3. 添加 BSC 特定的標識
    this.metadata.attributes.push({
      trait_type: 'Chain',
      value: 'BSC',
      display_type: 'string'
    });
    
    return this.metadata;
  }
}

// 4. 環境變數建議
// 在 .env 中添加
ENABLE_MARKET_FETCH=false  // 暫時關閉市場數據獲取，因為只有 OKX
PRIMARY_MARKETPLACE=okx     // 設定主要市場為 OKX

// 5. 性能優化
// 既然只有 OKX，可以：
// - 減少不必要的市場 API 調用
// - 加強 OKX 相關的快取策略
// - 優化 OKX 專用的 metadata 格式