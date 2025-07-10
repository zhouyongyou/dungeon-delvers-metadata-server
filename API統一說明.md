# API 統一說明

## 🎯 統一方案

我們採用了**最小影響統一方案**，只修改對外API端點，保持內部架構不變。

## ✅ 已完成的統一

### **1. 後端API路由**
```javascript
// 統一前 → 統一後
/api/vipstaking/:tokenId     → /api/vip/:tokenId
/api/playerprofile/:tokenId  → /api/profile/:tokenId

// 保持不變
/api/hero/:tokenId   ✓
/api/relic/:tokenId  ✓
/api/party/:tokenId  ✓
/health              ✓
```

### **2. 文檔更新**
- ✅ README.md 中的API端點已更新
- ✅ .env.example 添加了對應關係註釋

## 🔧 各部分需要的修改

### **1. 前端（如果存在）**
```javascript
// 需要修改API調用
// 修改前：
const vipData = await fetch(`/api/vipstaking/${tokenId}`)
const profileData = await fetch(`/api/playerprofile/${tokenId}`)

// 修改後：
const vipData = await fetch(`/api/vip/${tokenId}`)
const profileData = await fetch(`/api/profile/${tokenId}`)
```

### **2. 子圖（The Graph）**
```
❌ 不需要修改
理由：GraphQL查詢與API路由無關
```

### **3. 智能合約**
```
❌ 不需要修改
理由：合約本身沒有變化
```

### **4. 後端內部結構**
```
❌ 不需要修改
保持原有命名：
- 環境變數：VITE_MAINNET_VIPSTAKING_ADDRESS
- 合約地址：contractAddresses.vipStaking
- ABI：vipStakingABI
- GraphQL查詢：GET_VIP_QUERY, GET_PLAYER_PROFILE_QUERY
```

## 📋 對應關係表

| API端點 | 環境變數 | 合約名稱 | GraphQL查詢 |
|---------|----------|----------|-------------|
| `/api/vip/:tokenId` | `VITE_MAINNET_VIPSTAKING_ADDRESS` | VipStaking | `GET_VIP_QUERY` |
| `/api/profile/:tokenId` | `VITE_MAINNET_PLAYERPROFILE_ADDRESS` | PlayerProfile | `GET_PLAYER_PROFILE_QUERY` |
| `/api/relic/:tokenId` | `VITE_MAINNET_RELIC_ADDRESS` | Relic | `GET_RELIC_QUERY` |
| `/api/hero/:tokenId` | `VITE_MAINNET_HERO_ADDRESS` | Hero | `GET_HERO_QUERY` |
| `/api/party/:tokenId` | `VITE_MAINNET_PARTY_ADDRESS` | Party | `GET_PARTY_QUERY` |

## 🚀 測試新的API端點

```bash
# 啟動伺服器後測試
curl http://localhost:3001/api/vip/1
curl http://localhost:3001/api/profile/1
curl http://localhost:3001/api/relic/1
curl http://localhost:3001/health
```

## 💡 為什麼選擇這個方案？

1. **最小影響**：只改變對外接口，內部邏輯不變
2. **向後兼容**：環境變數和配置保持不變
3. **易於部署**：不影響現有的部署配置
4. **直觀命名**：API端點更加語義化

這樣統一後，API端點更加直觀，同時保持了系統的穩定性。