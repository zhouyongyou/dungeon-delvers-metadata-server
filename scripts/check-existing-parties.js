// check-existing-parties.js - 檢查實際存在的隊伍
require('dotenv').config();
const { ethers } = require('ethers');

async function checkExistingParties() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.BSC_MAINNET_RPC_URL || 'https://bsc-dataseed.binance.org/');
    
    // V22 合約地址
    const PARTY_CONTRACT_ADDRESS = '0x0B97726acd5a8Fe73c73dC6D473A51321a2e62ee';
    
    const PARTY_ABI = [
        "function ownerOf(uint256 tokenId) external view returns (address)",
        "function totalSupply() external view returns (uint256)",
        "function tokenByIndex(uint256 index) external view returns (uint256)"
    ];
    
    console.log('🔍 檢查 Party 合約中實際存在的隊伍...\n');
    console.log('Party 合約地址:', PARTY_CONTRACT_ADDRESS);
    
    try {
        const partyContract = new ethers.Contract(PARTY_CONTRACT_ADDRESS, PARTY_ABI, provider);
        
        // 檢查總供應量
        try {
            const totalSupply = await partyContract.totalSupply();
            console.log('✅ 隊伍總數:', totalSupply.toString());
            
            if (totalSupply.gt(0)) {
                console.log('\n📋 現有隊伍列表:');
                
                // 檢查前幾個隊伍
                const maxCheck = Math.min(Number(totalSupply), 10);
                for (let i = 0; i < maxCheck; i++) {
                    try {
                        const tokenId = await partyContract.tokenByIndex(i);
                        const owner = await partyContract.ownerOf(tokenId);
                        console.log(`✅ 隊伍 #${tokenId.toString()} - 擁有者: ${owner}`);
                    } catch (error) {
                        console.log(`❌ 索引 ${i} 獲取失敗:`, error.message);
                    }
                }
                
                if (Number(totalSupply) > 10) {
                    console.log(`... 還有 ${Number(totalSupply) - 10} 個隊伍未顯示`);
                }
            } else {
                console.log('❌ 目前沒有任何隊伍存在');
            }
            
        } catch (error) {
            console.log('❌ 無法獲取 totalSupply，嘗試直接檢查隊伍 ID...');
            
            // 如果 totalSupply 不可用，直接檢查一些常見的 ID
            const testIds = [1, 2, 3, 4, 5, 17, 20, 25];
            console.log('\n🎯 檢查常見隊伍 ID:');
            
            for (const id of testIds) {
                try {
                    const owner = await partyContract.ownerOf(id);
                    console.log(`✅ 隊伍 #${id} 存在 - 擁有者: ${owner}`);
                } catch (error) {
                    console.log(`❌ 隊伍 #${id} 不存在`);
                }
            }
        }
        
        // 特別檢查隊伍 #17
        console.log('\n🎯 特別檢查隊伍 #17:');
        try {
            const owner = await partyContract.ownerOf(17);
            console.log(`✅ 隊伍 #17 存在 - 擁有者: ${owner}`);
        } catch (error) {
            console.log('❌ 隊伍 #17 確實不存在');
            console.log('📝 建議: 請使用存在的隊伍 ID 進行測試');
        }
        
    } catch (error) {
        console.error('❌ 檢查過程中發生錯誤:', error);
    }
}

checkExistingParties().catch(console.error);