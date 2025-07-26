// debug-expedition.js - 調試出征交易失敗問題
require('dotenv').config();
const { ethers } = require('ethers');

// 合約 ABI
const DUNGEON_MASTER_ABI = [
    "function requestExpedition(uint256 _partyId, uint256 _dungeonId) external payable",
    "function explorationFee() external view returns (uint256)",
    "function dungeonCore() external view returns (address)",
    "function dungeonStorage() external view returns (address)",
    "function isPartyLocked(uint256 _partyId) external view returns (bool)"
];

const PARTY_ABI = [
    "function ownerOf(uint256 tokenId) external view returns (address)",
    "function getPartyComposition(uint256 partyId) external view returns (uint256 totalPower, uint256 totalCapacity)",
    "function partyCompositions(uint256 partyId) external view returns (uint256[] heroIds, uint256[] relicIds, uint256 totalPower, uint256 totalCapacity, uint8 partyRarity)"
];

const DUNGEON_STORAGE_ABI = [
    "function getDungeon(uint256 dungeonId) external view returns (tuple(uint256 requiredPower, uint256 rewardAmountUSD, uint8 baseSuccessRate, bool isInitialized))",
    "function getPartyStatus(uint256 partyId) external view returns (tuple(uint256 provisionsRemaining, uint256 cooldownEndsAt, uint256 unclaimedRewards, uint8 fatigueLevel))"
];

const DUNGEON_CORE_ABI = [
    "function partyContractAddress() external view returns (address)"
];

async function debugExpedition() {
    // 配置
    const provider = new ethers.providers.JsonRpcProvider(process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    // 合約地址
    const DUNGEON_MASTER_ADDRESS = '0xd13250E0F0766006816d7AfE95EaEEc5e215d082';
    const PARTY_ID = 17n; // 你的隊伍 ID
    const DUNGEON_ID = 1n; // 地下城 ID
    
    console.log('🔍 開始調試出征交易失敗問題...\n');
    console.log('錢包地址:', wallet.address);
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
        console.log('DungeonCore:', dungeonCoreAddress);
        console.log('DungeonStorage:', dungeonStorageAddress);
        
        // 3. 獲取 Party 合約地址
        const dungeonCore = new ethers.Contract(dungeonCoreAddress, DUNGEON_CORE_ABI, provider);
        const partyContractAddress = await dungeonCore.partyContractAddress();
        console.log('Party Contract:', partyContractAddress);
        console.log('\n===========================================\n');
        
        // 4. 檢查隊伍擁有權
        console.log('👥 檢查隊伍擁有權...');
        const partyContract = new ethers.Contract(partyContractAddress, PARTY_ABI, provider);
        try {
            const owner = await partyContract.ownerOf(PARTY_ID);
            console.log('隊伍擁有者:', owner);
            console.log('是否為當前錢包:', owner.toLowerCase() === wallet.address.toLowerCase() ? '✅ 是' : '❌ 否');
            
            if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
                console.error('\n❌ 錯誤: 你不是這個隊伍的擁有者！');
                console.log('請確保使用正確的錢包地址或隊伍 ID');
                return;
            }
        } catch (error) {
            console.error('❌ 無法獲取隊伍擁有者:', error.message);
            console.log('可能隊伍不存在或合約地址錯誤');
            return;
        }
        
        // 5. 檢查探索費用
        console.log('\n💰 檢查探索費用...');
        const explorationFee = await dungeonMaster.explorationFee();
        console.log('所需費用:', ethers.formatEther(explorationFee), 'BNB');
        
        const balance = await provider.getBalance(wallet.address);
        console.log('錢包餘額:', ethers.formatEther(balance), 'BNB');
        console.log('餘額足夠:', balance >= explorationFee ? '✅ 是' : '❌ 否');
        
        // 6. 檢查隊伍鎖定狀態
        console.log('\n🔒 檢查隊伍鎖定狀態...');
        const isLocked = await dungeonMaster.isPartyLocked(PARTY_ID);
        console.log('隊伍是否被鎖定:', isLocked ? '❌ 是（冷卻中）' : '✅ 否');
        
        // 7. 檢查隊伍狀態詳情
        console.log('\n📊 檢查隊伍狀態詳情...');
        const dungeonStorage = new ethers.Contract(dungeonStorageAddress, DUNGEON_STORAGE_ABI, provider);
        const partyStatus = await dungeonStorage.getPartyStatus(PARTY_ID);
        console.log('儲備剩餘:', partyStatus.provisionsRemaining?.toString() || partyStatus[0]?.toString());
        console.log('冷卻結束時間:', new Date(Number(partyStatus.cooldownEndsAt || partyStatus[1]) * 1000).toLocaleString());
        console.log('未領取獎勵:', ethers.formatEther(partyStatus.unclaimedRewards || partyStatus[2] || 0n), 'SOUL');
        console.log('疲勞等級:', partyStatus.fatigueLevel?.toString() || partyStatus[3]?.toString());
        
        // 8. 檢查隊伍戰力
        console.log('\n⚔️ 檢查隊伍戰力...');
        try {
            const [totalPower, totalCapacity] = await partyContract.getPartyComposition(PARTY_ID);
            console.log('隊伍總戰力:', totalPower.toString());
            console.log('隊伍總容量:', totalCapacity.toString());
            
            // 獲取更詳細的組成信息
            const composition = await partyContract.partyCompositions(PARTY_ID);
            console.log('英雄數量:', composition.heroIds?.length || composition[0]?.length || 0);
            console.log('聖物數量:', composition.relicIds?.length || composition[1]?.length || 0);
        } catch (error) {
            console.error('❌ 無法獲取隊伍戰力:', error.message);
        }
        
        // 9. 檢查地下城要求
        console.log('\n🏰 檢查地下城要求...');
        const dungeon = await dungeonStorage.getDungeon(DUNGEON_ID);
        console.log('所需戰力:', dungeon.requiredPower?.toString() || dungeon[0]?.toString());
        console.log('獎勵金額 (USD):', ethers.formatEther(dungeon.rewardAmountUSD || dungeon[1] || 0n));
        console.log('基礎成功率:', (dungeon.baseSuccessRate || dungeon[2])?.toString() + '%');
        console.log('地下城已初始化:', dungeon.isInitialized || dungeon[3] ? '✅' : '❌');
        
        // 10. 嘗試模擬交易
        console.log('\n🧪 嘗試模擬交易...');
        try {
            // 使用 staticCall 模擬交易
            await dungeonMaster.requestExpedition.staticCall(PARTY_ID, DUNGEON_ID, {
                value: explorationFee,
                from: wallet.address
            });
            console.log('✅ 模擬交易成功！交易應該可以執行。');
            
            // 詢問是否執行真實交易
            console.log('\n是否要執行真實交易？請手動確認後運行 execute-expedition.js');
            
        } catch (error) {
            console.error('❌ 模擬交易失敗:');
            console.error('錯誤信息:', error.message);
            
            // 解析錯誤原因
            if (error.message.includes('Not party owner')) {
                console.log('\n❌ 失敗原因: 你不是隊伍擁有者');
            } else if (error.message.includes('BNB fee not met')) {
                console.log('\n❌ 失敗原因: BNB 費用不足');
            } else if (error.message.includes('Core contracts not set')) {
                console.log('\n❌ 失敗原因: 核心合約未設置');
            } else if (error.message.includes('Dungeon DNE')) {
                console.log('\n❌ 失敗原因: 地下城不存在');
            } else if (error.message.includes('Party on cooldown')) {
                console.log('\n❌ 失敗原因: 隊伍在冷卻中');
            } else if (error.message.includes('Power too low')) {
                console.log('\n❌ 失敗原因: 隊伍戰力不足');
            } else if (error.message.includes('#1002')) {
                console.log('\n❌ 失敗原因: 錯誤代碼 #1002 - 可能是合約版本不匹配或數據結構問題');
            }
        }
        
    } catch (error) {
        console.error('\n❌ 調試過程中發生錯誤:', error);
    }
}

// 執行調試
debugExpedition().catch(console.error);