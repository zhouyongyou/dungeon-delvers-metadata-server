// V25 Contract Configuration for Backend
// Generated on 2025-08-03T11:07:19.320Z
// DO NOT EDIT MANUALLY - Use v25-sync-all.js to update

module.exports = {
  // BSC Mainnet Contracts
  contracts: {
    // Core Contracts
    DUNGEONCORE: '0x2953ed03825b40e9c1EBa1cAe5FBD47f20A4823d',
    ORACLE: '0xdbf49cd5708C56b8b0848233b754b418806D7018',
    
    // Token Contracts
    SOULSHARD: '0x97B2C2a9A11C7b6A020b4bAEaAd349865eaD0bcF',
    
    // NFT Contracts
    HERO: '0x001b7462B0f1Ab832c017a6f09133932Be140b18',
    RELIC: '0xdd8E52cD1d248D04C306c038780315a03866B402',
    PARTY: '0x382024850E08AB37E290315fc5f3692b8D6646EB',
    
    // Game Contracts
    DUNGEONMASTER: '0x9e17c01A610618223d49D64E322DC1b6360E4E8D',
    DUNGEONSTORAGE: '0x22bbcF5411c991A5DE7774Ace435DcBF69EF0a8a',
    PLAYERVAULT: '0x7085b353f553225B6001Ba23ECCb39611fBa31Bf',
    PLAYERPROFILE: '0x481ABDF19E41Bf2cE84075174675626aa027fE82',
    
    // Feature Contracts
    VIPSTAKING: '0xC0D8C84e28E5BcfC9cBD109551De53BA04e7328C',
    ALTAROFASCENSION: '0xB102a57eD4697f7A721541fd7B0bba8D6bdF63a5',
    
    // External
    DUNGEONMASTERWALLET: '0x10925A7138649C7E1794CE646182eeb5BF8ba647',
  },
  
  // Contract version for tracking
  version: 'V25',
  
  // Network configuration
  network: {
    chainId: 56,
    name: 'BSC Mainnet',
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/'
  }
};
