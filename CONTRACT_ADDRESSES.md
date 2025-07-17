# 合約地址管理文檔

## 目的
記錄所有需要更新合約地址的文件位置，以便在部署新版本合約時不會遺漏任何地方。

## V2 合約地址 (2025-01-17 部署)

```
Hero: 0xaa3166b87648F10E7C8A59f000E48d21A1A048C1  
Relic: 0x7023E506A9AD9339D5150c1c9F767A422066D3Df
Party: 0xb069B70d61f96bE5f5529dE216538766672f1096
DungeonMaster: 0xd13250E0F0766006816d7AfE95EaEEc5e215d082
VIPStaking: 0x769C47058c786A9d1b0948922Db70A56394c96FD
PlayerProfile: 0x861CFCA7af4E6005884CF3fE89C2a5Cf3d6F3c85
SoulShard: 0xc88dAD283Ac209D77Bfe452807d378615AB8B94a
```

## 需要更新的文件位置

### 1. 後端 Metadata Server
- **src/index.js** (line 110-115)
  - CONTRACTS 對象中的 fallback 地址
- **src/contractReader.js** (line 8-12)
  - CONTRACTS 對象
- **.env**
  - 所有 VITE_MAINNET_*_ADDRESS 變數

### 2. 硬編碼地址檢查清單

#### 主要文件
- [ ] `src/index.js` - CONTRACTS 對象 (已更新 ✅)
- [ ] `src/contractReader.js` - CONTRACTS 對象 (已更新 ✅)
- [ ] `.env` - 環境變數 (已更新 ✅)

#### 需要檢查的其他文件
- [ ] `src/config.js` (如果存在)
- [ ] `src/utils/*.js` (檢查工具函數)
- [ ] `tests/*.js` (測試文件中的地址)
- [ ] `package.json` (scripts 中可能有地址)

## 更新流程

1. **檢查所有硬編碼地址**
   ```bash
   grep -r "0x[a-fA-F0-9]\{40\}" src/
   ```

2. **更新合約地址**
   - 更新所有上述文件中的地址
   - 確保環境變數正確設置

3. **測試**
   - 本地測試所有 API 端點
   - 驗證合約讀取功能正常

4. **部署**
   - 部署到 Render
   - 更新 DNS 和環境變數

## 檢查指令

```bash
# 搜尋所有可能的合約地址
grep -r "0x[a-fA-F0-9]\{40\}" . --exclude-dir=node_modules

# 檢查特定的舊地址
grep -r "0x929a4187a462314fCC480ff547019fA122A283f0" . --exclude-dir=node_modules
grep -r "0x1067295025D21f59C8AcB5E777E42F3866a6D2fF" . --exclude-dir=node_modules
```