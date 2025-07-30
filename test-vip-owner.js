// 測試 VIP owner 自動查詢功能
const { ethers } = require('ethers');

// VIP Staking 合約地址和 ABI
const VIP_CONTRACT = '0x17D2BF72720d0E6BE6658e92729820350F6B4080';
const VIP_ABI = [
  {
    "inputs": [{"internalType": "address", "name": "user", "type": "address"}],
    "name": "getVipLevel",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}],
    "name": "ownerOf",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  }
];

// BSC RPC
const provider = new ethers.JsonRpcProvider('https://bsc-dataseed1.binance.org/');

async function testVipOwnerQuery() {
  try {
    console.log('🧪 測試 VIP owner 自動查詢...');
    
    const contract = new ethers.Contract(VIP_CONTRACT, VIP_ABI, provider);
    
    // 測試 tokenId 1
    const tokenId = 1;
    console.log(`\n📍 測試 VIP #${tokenId}:`);
    
    // 1. 獲取 owner
    const owner = await contract.ownerOf(tokenId);
    console.log(`✅ Owner: ${owner}`);
    
    // 2. 獲取 VIP 等級
    const level = await contract.getVipLevel(owner);
    const vipLevel = Number(level);
    console.log(`✅ VIP Level: ${vipLevel}`);
    
    // 3. 生成預期的 metadata
    const expectedMetadata = {
      name: vipLevel > 0 ? `Level ${vipLevel} VIP #${tokenId}` : `VIP #${tokenId}`,
      description: vipLevel > 0 
        ? `Dungeon Delvers VIP Level ${vipLevel} - Exclusive membership with enhanced staking benefits and privileges.`
        : `Dungeon Delvers VIP - Exclusive membership with staking benefits. VIP level is determined by staked amount.`,
      image: `https://dungeondelvers.xyz/images/vip/vip-1.png`,
      attributes: [
        { trait_type: 'Token ID', value: tokenId, display_type: 'number' },
        { trait_type: 'Type', value: 'VIP Membership' },
        ...(vipLevel > 0 ? [{
          trait_type: 'VIP Level',
          value: vipLevel,
          display_type: 'number',
          max_value: 10
        }] : []),
        { trait_type: 'Chain', value: 'BSC' },
        { trait_type: 'Data Source', value: 'Contract Auto-Query' },
        { trait_type: 'Owner', value: owner }
      ]
    };
    
    console.log('\n📄 預期的 metadata:');
    console.log(JSON.stringify(expectedMetadata, null, 2));
    
    console.log('\n✅ 測試完成！新的邏輯應該能自動查詢 owner 和等級。');
    
  } catch (error) {
    console.error('❌ 測試失敗:', error.message);
  }
}

testVipOwnerQuery();