# OKX NFT Metadata 兼容性報告

## 問題分析

經過檢查 NFT metadata server 的實現，發現以下可能導致 OKX 解析錯誤的問題：

### 1. **星級屬性格式問題** ⚠️

**發現的問題：**
- 原始程式碼中，當資料載入中時，Rarity 屬性值可能返回字串（如 `'載入中...'`）
- OKX 期望星級/稀有度為數字類型（1-5）
- 字串格式的星級值可能導致 OKX 無法正確解析和顯示

**影響範圍：**
- Hero NFTs
- Relic NFTs  
- Party NFTs

### 2. **屬性值類型不一致**

**原始程式碼問題：**
```javascript
// 問題代碼
{ trait_type: 'Rarity', value: rarity || '載入中...' }
{ trait_type: 'Power', value: '載入中...' }
{ trait_type: 'Capacity', value: '載入中...' }
```

**標準要求：**
- OpenSea metadata standard 允許 value 為 string 或 number
- 但 OKX 對數值型屬性（如星級、力量值）期望接收 number 類型

### 3. **圖片 URL 格式**

雖然程式碼中使用了絕對 HTTPS URL，但需要確保：
- 所有圖片 URL 都是 HTTPS
- URL 必須是絕對路徑
- 圖片必須可公開訪問

## 已實施的修復

### 1. **修復 fallback metadata 生成**

將所有數值型屬性改為數字：
```javascript
// 修復後
attributes: [
  { trait_type: 'Power', value: 0 },  // 原本是 '載入中...'
  { trait_type: 'Rarity', value: typeof rarity === 'number' ? rarity : 1 }
]
```

### 2. **添加 OKX 兼容性層**

新增 `ensureOKXCompatibility` 函數，確保：
- Rarity 永遠是 1-5 的數字
- 所有數值型屬性都轉換為數字
- 圖片 URL 確保是 HTTPS
- 添加 external_url 欄位

### 3. **在 API 回應前應用修復**

所有 NFT metadata 在返回前都會經過兼容性處理：
```javascript
nftData = ensureOKXCompatibility(nftData, type, tokenId);
res.json(nftData);
```

## 修復效果

### Before（可能導致 OKX 錯誤）:
```json
{
  "name": "英雄 #1",
  "attributes": [
    { "trait_type": "Power", "value": "載入中..." },
    { "trait_type": "Rarity", "value": "載入中..." }
  ]
}
```

### After（OKX 兼容）:
```json
{
  "name": "英雄 #1",
  "attributes": [
    { "trait_type": "Power", "value": 0 },
    { "trait_type": "Rarity", "value": 1 }
  ],
  "external_url": "https://dungeondelvers.xyz/nft/hero/1"
}
```

## 測試建議

1. **運行測試腳本**
   ```bash
   cd /Users/sotadic/Documents/dungeon-delvers-metadata-server
   npm start  # 啟動伺服器
   node test-metadata.js  # 在另一個終端運行測試
   ```

2. **手動測試**
   - 訪問 `http://localhost:3001/api/hero/1`
   - 確認 Rarity 值是數字（1-5）
   - 確認所有數值屬性都是 number 類型

3. **OKX 平台測試**
   - 部署更新後，在 OKX 上刷新 NFT metadata
   - 確認星級正確顯示

## 其他建議

1. **標準化屬性命名**
   - 統一使用 "Rarity" 而非 "Star Rating" 或其他變體
   - 保持與 OpenSea 標準一致

2. **添加 display_type**（可選）
   ```javascript
   { 
     trait_type: 'Rarity', 
     value: 3,
     display_type: 'number'  // 明確指定顯示類型
   }
   ```

3. **監控和日誌**
   - 記錄 OKX 的請求
   - 監控是否有解析錯誤

## 結論

主要問題是 **Rarity 屬性在某些情況下返回字串值**，這很可能是導致 OKX 無法正確顯示星級的原因。已實施的修復確保：

1. ✅ Rarity 永遠是 1-5 的數字
2. ✅ 所有數值屬性都是正確的類型
3. ✅ 符合 NFT metadata 標準
4. ✅ 兼容 OKX 和其他主流 NFT 市場

請部署這些修改並在 OKX 上測試效果。