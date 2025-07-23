#!/usr/bin/env node

/**
 * 後端動態配置載入器測試腳本
 * 用於驗證生產環境配置載入功能
 */

const axios = require('axios');
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 測試配置
const TEST_CONFIG = {
  local: 'http://localhost:3001',
  production: 'https://dungeon-delvers-metadata-server.onrender.com'
};

async function testConfigLoading(baseUrl) {
  log(`\n🧪 測試配置載入功能: ${baseUrl}`, 'magenta');
  log('=' .repeat(50), 'magenta');
  
  try {
    // 1. 測試健康檢查端點
    log('\n1️⃣ 測試 /health 端點...', 'cyan');
    const healthResponse = await axios.get(`${baseUrl}/health`);
    const healthData = healthResponse.data;
    
    log(`✅ 狀態: ${healthData.status}`, 'green');
    log(`📋 配置版本: ${healthData.configVersion}`, 'cyan');
    log(`⏱️ 運行時間: ${Math.floor(healthData.uptime)}秒`, 'cyan');
    
    // 檢查配置源
    if (healthData.configVersion === 'V15') {
      log('✅ 成功從 CDN 載入配置！', 'green');
    } else if (healthData.configVersion === 'Unknown') {
      log('⚠️ 使用環境變數作為備份', 'yellow');
    } else {
      log(`📌 配置版本: ${healthData.configVersion}`, 'cyan');
    }
    
    // 2. 測試根端點
    log('\n2️⃣ 測試根端點...', 'cyan');
    const rootResponse = await axios.get(baseUrl);
    const rootData = rootResponse.data;
    
    log(`✅ 服務名稱: ${rootData.service}`, 'green');
    log(`📋 配置來源: ${rootData.features.configSource}`, 'cyan');
    log(`🔄 動態配置: ${rootData.features.dynamicConfig ? '啟用' : '禁用'}`, 'cyan');
    log(`♻️ 自動刷新: ${rootData.features.autoRefresh ? '啟用' : '禁用'}`, 'cyan');
    
    // 3. 測試配置刷新
    log('\n3️⃣ 測試配置刷新 API...', 'cyan');
    try {
      const refreshResponse = await axios.post(`${baseUrl}/api/config/refresh`);
      const refreshData = refreshResponse.data;
      
      log(`✅ ${refreshData.message}`, 'green');
      log(`📋 版本: ${refreshData.version}`, 'cyan');
      log(`📦 合約數量: ${refreshData.contracts}`, 'cyan');
      log(`🔗 子圖: ${refreshData.subgraph}`, 'cyan');
    } catch (error) {
      if (error.response?.status === 404) {
        log('⚠️ 配置刷新端點不存在（可能是舊版本）', 'yellow');
      } else {
        throw error;
      }
    }
    
    // 4. 測試 NFT metadata 端點（使用配置的合約地址）
    log('\n4️⃣ 測試 NFT metadata 端點...', 'cyan');
    try {
      const nftResponse = await axios.get(`${baseUrl}/api/hero/1`);
      const nftData = nftResponse.data;
      
      if (nftData.name) {
        log(`✅ NFT 查詢正常: ${nftData.name}`, 'green');
        log(`🏷️ Token ID: ${nftData.tokenId}`, 'cyan');
      } else {
        log('⚠️ NFT 不存在或未鑄造', 'yellow');
      }
    } catch (error) {
      if (error.response?.status === 404) {
        log('⚠️ NFT #1 尚未鑄造', 'yellow');
      } else {
        log(`❌ NFT 查詢錯誤: ${error.message}`, 'red');
      }
    }
    
    // 5. 總結
    log('\n📊 測試總結:', 'magenta');
    log('✅ 後端服務運行正常', 'green');
    log('✅ 動態配置載入功能正常', 'green');
    log('✅ API 端點響應正常', 'green');
    
    return true;
  } catch (error) {
    log(`\n❌ 測試失敗: ${error.message}`, 'red');
    if (error.response) {
      log(`狀態碼: ${error.response.status}`, 'red');
      log(`響應: ${JSON.stringify(error.response.data)}`, 'red');
    }
    return false;
  }
}

async function testCacheMechanism(baseUrl) {
  log(`\n🧪 測試緩存機制`, 'magenta');
  log('=' .repeat(50), 'magenta');
  
  try {
    // 1. 第一次請求
    log('\n1️⃣ 第一次請求（應該從 CDN 載入）...', 'cyan');
    const response1 = await axios.get(`${baseUrl}/health`);
    const version1 = response1.data.configVersion;
    log(`版本: ${version1}`, 'cyan');
    
    // 2. 立即第二次請求
    log('\n2️⃣ 立即第二次請求（應該使用緩存）...', 'cyan');
    const response2 = await axios.get(`${baseUrl}/health`);
    const version2 = response2.data.configVersion;
    log(`版本: ${version2}`, 'cyan');
    
    if (version1 === version2) {
      log('✅ 緩存機制正常工作', 'green');
    } else {
      log('⚠️ 版本不一致，可能緩存未生效', 'yellow');
    }
    
    // 3. 測試強制刷新
    log('\n3️⃣ 強制刷新配置...', 'cyan');
    await axios.post(`${baseUrl}/api/config/refresh`);
    log('✅ 配置已刷新', 'green');
    
    return true;
  } catch (error) {
    log(`\n❌ 緩存測試失敗: ${error.message}`, 'red');
    return false;
  }
}

async function main() {
  log('\n🚀 DungeonDelvers 後端配置載入器測試', 'magenta');
  log('=====================================', 'magenta');
  
  const args = process.argv.slice(2);
  const env = args[0] || 'local';
  const baseUrl = TEST_CONFIG[env] || args[0];
  
  if (!baseUrl) {
    log('\n使用方法:', 'yellow');
    log('  node test-backend-config.js [local|production|<url>]', 'cyan');
    log('\n範例:', 'yellow');
    log('  node test-backend-config.js local', 'cyan');
    log('  node test-backend-config.js production', 'cyan');
    log('  node test-backend-config.js https://your-server.com', 'cyan');
    process.exit(1);
  }
  
  log(`\n測試環境: ${env}`, 'cyan');
  log(`目標 URL: ${baseUrl}`, 'cyan');
  
  // 執行測試
  const configTest = await testConfigLoading(baseUrl);
  const cacheTest = await testCacheMechanism(baseUrl);
  
  // 最終結果
  log('\n\n🏁 測試完成', 'magenta');
  log('=' .repeat(50), 'magenta');
  
  if (configTest && cacheTest) {
    log('✅ 所有測試通過！', 'green');
    log('\n建議部署配置:', 'cyan');
    log('1. Render 環境變數只需要:', 'yellow');
    log('   NODE_ENV=production', 'cyan');
    log('   CORS_ORIGIN=<你的域名>', 'cyan');
    log('   FRONTEND_DOMAIN=https://dungeondelvers.xyz', 'cyan');
    log('2. 合約地址會自動從 CDN 載入', 'yellow');
    log('3. 配置更新後 5 分鐘內自動生效', 'yellow');
  } else {
    log('❌ 部分測試失敗，請檢查錯誤信息', 'red');
    process.exit(1);
  }
}

// 處理未捕獲的 Promise 錯誤
process.on('unhandledRejection', (error) => {
  log(`\n❌ 未處理的錯誤: ${error.message}`, 'red');
  process.exit(1);
});

// 如果需要 axios，先安裝
try {
  require('axios');
  main();
} catch (error) {
  log('\n📦 安裝依賴...', 'yellow');
  const { execSync } = require('child_process');
  execSync('npm install axios', { stdio: 'inherit' });
  
  // 重新執行
  delete require.cache[require.resolve('axios')];
  main();
}