# 合約地址管理文檔

## 目的
記錄所有需要更新合約地址的文件位置，以便在部署新版本合約時不會遺漏任何地方。

## V18 合約地址 (2025-07-24 部署)

```
Hero: 0x6E4dF8F5413B42EC7b82D2Bc20254Db5A11DB374
Relic: 0x40e001D24aD6a28FC40870901DbF843D921fe56C
Party: 0xb26466A44f51CfFF8C13837dA8B2aD6BA82c62dF
DungeonMaster: 0x5dCf67D1486D80Dfcd8E665D240863D58eb73ce0
VIPStaking: 0xe4B6C86748b49D91ac635A56a9DF25af963F8fdd
PlayerProfile: 0xE5E85233082827941A9E9cb215bDB83407d7534b
SoulShard: 0x97B2C2a9A11C7b6A020b4bAEaAd349865eaD0bcF
Oracle: 0x1Cd2FBa6f4614383C32f4807f67f059eF4Dbfd0c
DungeonCore: 0xDD970622bE2ac33163B1DCfB4b2045CeeD9Ab1a0
PlayerVault: 0xd0c6e73e877513e45491842e74Ac774ef735782D
DungeonStorage: 0x812C0433EeDD0bAf2023e9A4FB3dF946E5080D9A
AltarOfAscension: 0xCA4f59E6ccDEe6c8D0Ef239c2b8b007BFcd935E0
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
grep -r "0x2b6CB00D10EFB1aF0125a26dfcbd9EBa87e07CD2" . --exclude-dir=node_modules
grep -r "0xaEa78C3FC4bc50966aC41D76331fD0bf219D00ac" . --exclude-dir=node_modules
```