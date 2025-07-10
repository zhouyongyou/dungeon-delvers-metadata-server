# Dungeon Delvers 前端API修改示例

## 📁 文件說明

這個資料夾包含了前端需要修改的代碼示例，展示如何將API端點從舊版本統一到新版本。

### **文件結構**

```
frontend-examples/
├── README.md                    # 本文件 - 總體說明
├── 搜索替換指令.md               # 批量搜索替換指令
├── api/
│   └── metadata.js              # API服務層示例
├── components/
│   └── VIPCard.jsx              # React組件示例
├── constants/
│   └── api.js                   # API常數配置示例
└── hooks/
    └── useMetadata.js           # 自定義Hook示例
```

## 🔄 API修改對照表

| 組件類型 | 修改前 | 修改後 | 狀態 |
|---------|--------|--------|------|
| **VIP API** | `/api/vipstaking/:tokenId` | `/api/vip/:tokenId` | ✅ 已修復 |
| **Profile API** | `/api/playerprofile/:tokenId` | `/api/profile/:tokenId` | ✅ 已修復 |
| **Hero API** | `/api/hero/:tokenId` | `/api/hero/:tokenId` | ✅ 保持不變 |
| **Relic API** | `/api/relic/:tokenId` | `/api/relic/:tokenId` | ✅ 保持不變 |
| **Party API** | `/api/party/:tokenId` | `/api/party/:tokenId` | ✅ 保持不變 |

## 📝 修改指南

### **1. 快速開始**

如果你想快速修改你的前端代碼：

1. **查看 `搜索替換指令.md`** - 獲取批量替換命令
2. **參考 `api/metadata.js`** - 了解API服務層的修改方式
3. **檢查 `constants/api.js`** - 統一API端點常數

### **2. 不同技術棧的修改方式**

#### **React 專案**
- 參考：`components/VIPCard.jsx`
- 參考：`hooks/useMetadata.js`
- 重點：useEffect中的API調用

#### **Vue.js 專案**
```javascript
// 修改前
async fetchVipData() {
  const response = await fetch(`/api/vipstaking/${this.tokenId}`)
  // ...
}

// 修改後
async fetchVipData() {
  const response = await fetch(`/api/vip/${this.tokenId}`)
  // ...
}
```

#### **Next.js 專案**
```javascript
// 修改前
export async function getServerSideProps({ params }) {
  const res = await fetch(`${API_BASE}/api/vipstaking/${params.id}`)
  // ...
}

// 修改後
export async function getServerSideProps({ params }) {
  const res = await fetch(`${API_BASE}/api/vip/${params.id}`)
  // ...
}
```

### **3. 常見檔案位置**

通常需要修改的檔案：

- `src/api/` - API服務層
- `src/services/` - 服務層
- `src/utils/` - 工具函數
- `src/constants/` - 常數定義
- `src/components/` - 組件文件
- `src/hooks/` - 自定義Hook
- `src/stores/` - 狀態管理

## 🧪 測試方法

### **1. 單元測試更新**

```javascript
// 修改測試中的API端點
describe('VIP Metadata API', () => {
  it('should fetch VIP metadata', async () => {
    // 修改前：expect(fetchMock).toHaveBeenCalledWith('/api/vipstaking/1')
    expect(fetchMock).toHaveBeenCalledWith('/api/vip/1')
  })
})
```

### **2. 集成測試**

```javascript
// 在瀏覽器控制台中測試
// 測試新端點
fetch('/api/vip/1').then(r => r.json()).then(console.log)
fetch('/api/profile/1').then(r => r.json()).then(console.log)

// 確認舊端點返回404
fetch('/api/vipstaking/1').then(r => console.log('Status:', r.status)) // 應該是404
fetch('/api/playerprofile/1').then(r => console.log('Status:', r.status)) // 應該是404
```

## 🔧 環境配置

### **環境變數**

確保你的環境變數指向正確的API：

```bash
# .env
VITE_API_BASE_URL=https://api.dungeondelvers.xyz
REACT_APP_API_BASE_URL=https://api.dungeondelvers.xyz
NEXT_PUBLIC_API_BASE_URL=https://api.dungeondelvers.xyz
```

### **開發環境**

```bash
# 開發環境API
VITE_API_BASE_URL=http://localhost:3001
```

## 🚨 注意事項

### **1. 避免的常見錯誤**

- ❌ 不要只修改部分文件
- ❌ 不要忘記更新測試文件
- ❌ 不要忘記更新常數定義
- ❌ 不要忘記清除瀏覽器快取

### **2. 修改前的準備**

```bash
# 1. 備份當前代碼
git add -A
git commit -m "Backup before API endpoint update"

# 2. 確保後端API已經更新
curl http://localhost:3001/api/vip/1

# 3. 檢查所有需要修改的文件
grep -r "vipstaking\|playerprofile" ./src
```

### **3. 修改後的驗證**

```bash
# 1. 檢查語法錯誤
npm run lint

# 2. 運行測試
npm test

# 3. 檢查是否還有遺漏
grep -r "vipstaking\|playerprofile" ./src

# 4. 構建檢查
npm run build
```

## 🎯 檢查清單

修改完成後，請確認：

- [ ] 所有API調用已更新到新端點
- [ ] 常數配置已更新
- [ ] 測試代碼已更新
- [ ] 環境變數配置正確
- [ ] 沒有ESLint錯誤
- [ ] 沒有TypeScript錯誤
- [ ] 所有測試通過
- [ ] 瀏覽器Network面板沒有404錯誤
- [ ] 功能正常運作

## 🆘 故障排除

### **問題：修改後出現404錯誤**
**解決：** 檢查API端點是否正確，確認後端已更新

### **問題：部分功能不工作**
**解決：** 檢查是否有遺漏的API調用

### **問題：測試失敗**
**解決：** 更新測試中的API端點期望值

### **問題：TypeScript類型錯誤**
**解決：** 更新接口定義中的端點相關類型

---

**完成修改後，你的前端就能正常調用統一後的API端點了！** 🎉