// debug-expedition-readonly.js - 只讀模式的出征調試腳本
require('dotenv').config();
const { ethers } = require('ethers');

// 合約 ABI（只需要 view 函數）
const DUNGEON_MASTER_ABI = [
    "function explorationFee() external view returns (uint256)",
    "function dungeonCore() external view returns (address)",
    "function dungeonStorage() external view returns (address)",
    "function isPartyLocked(uint256 _partyId) external view returns (bool)"
];

const PARTY_ABI = [
    "function ownerOf(uint256 tokenId) external view returns (address)",
    "function getPartyComposition(uint256 partyId) external view returns (uint256 totalPower, uint256 totalCapacity)"
];

const DUNGEON_STORAGE_ABI = [
    "function getDungeon(uint256 dungeonId) external view returns (tuple(uint256 requiredPower, uint256 rewardAmountUSD, uint8 baseSuccessRate, bool isInitialized))",
    "function getPartyStatus(uint256 partyId) external view returns (tuple(uint256 provisionsRemaining, uint256 cooldownEndsAt, uint256 unclaimedRewards, uint8 fatigueLevel))"
];

const DUNGEON_CORE_ABI = [
    "function partyContractAddress() external view returns (address)"
];

async function debugExpeditionReadonly() {
    // 配置
    const provider = new ethers.providers.JsonRpcProvider(process.env.BSC_MAINNET_RPC_URL || 'https://bsc-dataseed.binance.org/');
    
    // 合約地址（來自 V22 配置）
    const DUNGEON_MASTER_ADDRESS = '0xd13250E0F0766006816d7AfE95EaEEc5e215d082';
    const PARTY_ID = 17n; // 測試隊伍 ID
    const DUNGEON_ID = 1n; // 測試地下城 ID
    const TEST_USER_ADDRESS = '0x10925A7138649C7E1794CE646182eeb5BF8ba647'; // DungeonMasterWallet 地址
    
    console.log('🔍 開始只讀模式出征調試...\n');
    console.log('測試地址:', TEST_USER_ADDRESS);
    console.log('隊伍 ID:', PARTY_ID.toString());
    console.log('地下城 ID:', DUNGEON_ID.toString());
    console.log('DungeonMaster 地址:', DUNGEON_MASTER_ADDRESS);
    console.log('\n===========================================\n');
    
    try {
        // 1. 創建合約實例
        const dungeonMaster = new ethers.Contract(DUNGEON_MASTER_ADDRESS, DUNGEON_MASTER_ABI, provider);
        
        // 2. 獲取核心合約地址
        console.log('📋 獲取核心合約地址...');
        const dungeonCoreAddress = await dungeonMaster.dungeonCore();
        const dungeonStorageAddress = await dungeonMaster.dungeonStorage();
        console.log('✅ DungeonCore:', dungeonCoreAddress);
        console.log('✅ DungeonStorage:', dungeonStorageAddress);
        
        // 3. 獲取 Party 合約地址
        const dungeonCore = new ethers.Contract(dungeonCoreAddress, DUNGEON_CORE_ABI, provider);
        const partyContractAddress = await dungeonCore.partyContractAddress();
        console.log('✅ Party Contract:', partyContractAddress);
        console.log('\n===========================================\n');
        
        // 4. 檢查隊伍擁有權
        console.log('👥 檢查隊伍擁有權...');
        const partyContract = new ethers.Contract(partyContractAddress, PARTY_ABI, provider);
        try {
            const owner = await partyContract.ownerOf(PARTY_ID);
            console.log('✅ 隊伍擁有者:', owner);
            console.log('⚠️  測試用戶權限:', owner.toLowerCase() === TEST_USER_ADDRESS.toLowerCase() ? '有權限' : '無權限');
        } catch (error) {
            console.error('❌ 無法獲取隊伍擁有者:', error.message);
            console.log('❌ 可能原因: 隊伍不存在');
            return;
        }
        
        // 5. 檢查探索費用
        console.log('\n💰 檢查探索費用...');
        const explorationFee = await dungeonMaster.explorationFee();
        console.log('✅ 所需費用:', ethers.utils.formatEther(explorationFee), 'BNB');
        
        // 6. 檢查隊伍鎖定狀態
        console.log('\n🔒 檢查隊伍鎖定狀態...');
        const isLocked = await dungeonMaster.isPartyLocked(PARTY_ID);
        console.log(isLocked ? '❌ 隊伍被鎖定（冷卻中）' : '✅ 隊伍可用');
        
        // 7. 檢查隊伍狀態詳情
        console.log('\n📊 檢查隊伍狀態詳情...');
        const dungeonStorage = new ethers.Contract(dungeonStorageAddress, DUNGEON_STORAGE_ABI, provider);
        const partyStatus = await dungeonStorage.getPartyStatus(PARTY_ID);
        
        const cooldownEndsAt = partyStatus.cooldownEndsAt || partyStatus[1];
        const currentTime = Math.floor(Date.now() / 1000);
        const isOnCooldown = Number(cooldownEndsAt) > currentTime;
        
        console.log('📍 儲備剩餘:', partyStatus.provisionsRemaining?.toString() || partyStatus[0]?.toString());
        console.log('⏰ 冷卻結束時間:', new Date(Number(cooldownEndsAt) * 1000).toLocaleString());
        console.log('🔄 是否在冷卻:', isOnCooldown ? '是' : '否');
        console.log('💰 未領取獎勵:', ethers.utils.formatEther(partyStatus.unclaimedRewards || partyStatus[2] || 0n), 'SOUL');
        console.log('😴 疲勞等級:', partyStatus.fatigueLevel?.toString() || partyStatus[3]?.toString());
        
        // 8. 檢查隊伍戰力
        console.log('\n⚔️  檢查隊伍戰力...');
        try {
            const [totalPower, totalCapacity] = await partyContract.getPartyComposition(PARTY_ID);
            console.log('✅ 隊伍總戰力:', totalPower.toString());
            console.log('✅ 隊伍總容量:', totalCapacity.toString());
        } catch (error) {
            console.error('❌ 無法獲取隊伍戰力:', error.message);
        }
        
        // 9. 檢查地下城要求
        console.log('\n🏰 檢查地下城要求...');
        const dungeon = await dungeonStorage.getDungeon(DUNGEON_ID);
        const requiredPower = dungeon.requiredPower || dungeon[0];
        const rewardAmountUSD = dungeon.rewardAmountUSD || dungeon[1];
        const baseSuccessRate = dungeon.baseSuccessRate || dungeon[2];
        const isInitialized = dungeon.isInitialized !== undefined ? dungeon.isInitialized : dungeon[3];
        
        console.log('✅ 所需戰力:', requiredPower.toString());
        console.log('✅ 獎勵金額 (USD):', ethers.utils.formatEther(rewardAmountUSD));
        console.log('✅ 基礎成功率:', baseSuccessRate.toString() + '%');
        console.log('✅ 地下城已初始化:', isInitialized ? '是' : '否');
        
        // 10. 戰力檢查
        console.log('\n🎯 戰力匹配檢查...');
        try {
            const [partyPower] = await partyContract.getPartyComposition(PARTY_ID);
            const powerSufficient = partyPower.gte(requiredPower);
            console.log(powerSufficient ? '✅ 戰力足夠' : '❌ 戰力不足');
            console.log('📊 戰力對比:', `${partyPower.toString()} vs ${requiredPower.toString()}`);
        } catch (error) {
            console.log('❌ 無法比較戰力');
        }
        
        // 11. 總結診斷
        console.log('\n🎯 診斷總結...');
        
        const diagnostics = [];
        
        // 基本檢查
        if (!isLocked && !isOnCooldown) {
            diagnostics.push('✅ 隊伍狀態正常（無冷卻）');
        } else {
            diagnostics.push('❌ 隊伍在冷卻中');
        }
        
        if (isInitialized) {
            diagnostics.push('✅ 地下城已初始化');
        } else {
            diagnostics.push('❌ 地下城未初始化');
        }
        
        // 檢查可能的錯誤原因
        console.log('\n🔍 可能的 #1002 錯誤原因分析：');
        
        if (isOnCooldown) {
            console.log('1. ❌ 隊伍冷卻中 - require(block.timestamp >= partyStatus.cooldownEndsAt)');
        } else {
            console.log('1. ✅ 隊伍冷卻檢查通過');
        }
        
        if (!isInitialized) {
            console.log('2. ❌ 地下城未初始化 - require(dungeon.isInitialized)');
        } else {
            console.log('2. ✅ 地下城初始化檢查通過');
        }
        
        try {
            const [partyPower] = await partyContract.getPartyComposition(PARTY_ID);
            if (partyPower.lt(requiredPower)) {
                console.log('3. ❌ 戰力不足 - require(totalPower >= dungeon.requiredPower)');
            } else {
                console.log('3. ✅ 戰力檢查通過');
            }
        } catch (error) {
            console.log('3. ❌ 無法獲取戰力數據 - 可能的合約接口問題');
        }
        
        console.log('\n📝 建議下一步：');
        console.log('1. 如果所有檢查都通過，問題可能在於：');
        console.log('   - 前端傳遞的參數格式錯誤');
        console.log('   - ABI 版本不匹配');
        console.log('   - 合約內部邏輯變更');
        console.log('2. 可以嘗試在管理頁面使用出征測試組件進行實際測試');
        console.log('3. 檢查瀏覽器控制台的詳細錯誤信息');
        
    } catch (error) {
        console.error('\n❌ 調試過程中發生錯誤:', error);
    }
}

// 執行調試
debugExpeditionReadonly().catch(console.error);