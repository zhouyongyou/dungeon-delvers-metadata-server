# Archived Code

## Marketplace Adapters (2025-07-30)

這些市場適配器文件已被封存，因為：

1. BSC 上主要只有 OKX 一個 NFT 市場
2. 適配器功能已整合到主程式的 `standardizeMetadata()` 函數中
3. 簡化架構，減少維護複雜度

### 封存文件：
- `adapters/MarketplaceAdapter.js` - 基礎適配器類別
- `adapters/OKXAdapter.js` - OKX 市場適配器
- `adapters/ElementAdapter.js` - Element 市場適配器

### 如需恢復：
1. 將 `archived/adapters/` 移回 `src/adapters/`
2. 在 `index.js` 中重新引入 `MarketplaceAdapter`
3. 恢復市場檢測和適配邏輯

### 相關 commit：
- Remove marketplace adapter system - integrate standardization into default processing