/**
 * 配置加載器 - 支援多種配置格式
 * V25 兼容性更新
 */

// 合約名稱映射表
const CONTRACT_MAPPINGS = {
  "hero": [
    "HERO",
    "Hero",
    "HERO_ADDRESS"
  ],
  "relic": [
    "RELIC",
    "Relic",
    "RELIC_ADDRESS"
  ],
  "dungeonCore": [
    "DUNGEONCORE",
    "DungeonCore",
    "DUNGEONCORE_ADDRESS"
  ],
  "dungeonMaster": [
    "DUNGEONMASTER",
    "DungeonMaster",
    "DUNGEONMASTER_ADDRESS"
  ],
  "dungeonStorage": [
    "DUNGEONSTORAGE",
    "DungeonStorage",
    "DUNGEONSTORAGE_ADDRESS"
  ],
  "party": [
    "PARTY",
    "Party",
    "PARTY_ADDRESS"
  ],
  "altarOfAscension": [
    "ALTAROFASCENSION",
    "AltarOfAscension",
    "ALTAROFASCENSION_ADDRESS"
  ],
  "playerVault": [
    "PLAYERVAULT",
    "PlayerVault",
    "PLAYERVAULT_ADDRESS"
  ],
  "playerProfile": [
    "PLAYERPROFILE",
    "PlayerProfile",
    "PLAYERPROFILE_ADDRESS"
  ],
  "vipStaking": [
    "VIPSTAKING",
    "VipStaking",
    "VIPSTAKING_ADDRESS"
  ],
  "oracle": [
    "ORACLE",
    "Oracle",
    "ORACLE_ADDRESS"
  ],
  "soulShard": [
    "SOULSHARD",
    "SoulShard",
    "SOULSHARD_ADDRESS"
  ],
  "vrfManager": [
    "VRFMANAGER",
    "VRFManager",
    "VRF_MANAGER",
    "VRFMANAGER_ADDRESS"
  ]
};

/**
 * 從配置中獲取合約地址
 * 支援多種命名格式：大寫、駝峰式、帶_ADDRESS後綴
 */
function getContractAddress(config, contractName) {
    if (!config || !config.contracts) return null;
    
    // 如果有映射，嘗試所有可能的格式
    if (CONTRACT_MAPPINGS[contractName]) {
        for (const key of CONTRACT_MAPPINGS[contractName]) {
            if (config.contracts[key]) {
                return config.contracts[key];
            }
        }
    }
    
    // 直接嘗試合約名
    if (config.contracts[contractName]) {
        return config.contracts[contractName];
    }
    
    // 嘗試大寫版本
    const upperName = contractName.toUpperCase();
    if (config.contracts[upperName]) {
        return config.contracts[upperName];
    }
    
    // 嘗試加 _ADDRESS 後綴
    if (config.contracts[`${upperName}_ADDRESS`]) {
        return config.contracts[`${upperName}_ADDRESS`];
    }
    
    return null;
}

/**
 * 載入所有合約地址
 */
function loadAllContracts(config) {
    const contracts = {};
    
    for (const [contractVar, possibleKeys] of Object.entries(CONTRACT_MAPPINGS)) {
        const address = getContractAddress(config, contractVar);
        if (address) {
            contracts[contractVar] = address;
        }
    }
    
    return contracts;
}

/**
 * 驗證配置完整性
 */
function validateConfig(config) {
    const required = ['hero', 'relic', 'dungeonCore', 'dungeonMaster'];
    const missing = [];
    
    for (const contract of required) {
        if (!getContractAddress(config, contract)) {
            missing.push(contract);
        }
    }
    
    if (missing.length > 0) {
        console.warn('⚠️  配置缺少必要的合約地址:', missing.join(', '));
        return false;
    }
    
    return true;
}

module.exports = {
    getContractAddress,
    loadAllContracts,
    validateConfig,
    CONTRACT_MAPPINGS
};
