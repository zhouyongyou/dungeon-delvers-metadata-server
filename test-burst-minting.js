#!/usr/bin/env node

// 突發鑄造場景測試腳本
// 模擬用戶在短時間內鑄造大量 NFT 的情況

const axios = require('axios');

const SERVER_URL = 'http://localhost:3000';
const CONCURRENT_REQUESTS = 25; // 同時請求數
const TOTAL_REQUESTS = 50;      // 總請求數

// 隨機生成 NFT 請求
function generateRandomNFTRequest() {
  const types = ['hero', 'relic', 'party'];
  const type = types[Math.floor(Math.random() * types.length)];
  const tokenId = Math.floor(Math.random() * 100) + 1; // 使用較小範圍，更有可能存在
  
  return {
    type,
    tokenId,
    url: `${SERVER_URL}/api/${type}/${tokenId}`
  };
}

// 發送單個請求
async function sendRequest(request, index) {
  const startTime = Date.now();
  
  try {
    console.log(`🚀 [${index}] 請求: ${request.type} #${request.tokenId}`);
    
    const response = await axios.get(request.url, {
      timeout: 30000, // 30 秒超時
      headers: {
        'User-Agent': 'BurstMintingTest/1.0'
      }
    });
    
    const duration = Date.now() - startTime;
    
    if (response.status === 200) {
      const cached = response.headers['x-cache-status'] || 'unknown';
      console.log(`✅ [${index}] 成功: ${request.type} #${request.tokenId} (${duration}ms, cache: ${cached})`);
      return {
        success: true,
        duration,
        cached,
        type: request.type,
        tokenId: request.tokenId
      };
    } else {
      console.log(`⚠️ [${index}] 異常狀態: ${response.status}`);
      return {
        success: false,
        status: response.status,
        duration,
        type: request.type,
        tokenId: request.tokenId
      };
    }
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`❌ [${index}] 失敗: ${request.type} #${request.tokenId} - ${error.message} (${duration}ms)`);
    return {
      success: false,
      error: error.message,
      duration,
      type: request.type,
      tokenId: request.tokenId
    };
  }
}

// 批量測試函數
async function runBurstTest() {
  console.log('🔥 開始突發鑄造測試');
  console.log(`📊 配置: ${CONCURRENT_REQUESTS} 併發, ${TOTAL_REQUESTS} 總請求`);
  console.log('=' * 60);
  
  const allRequests = [];
  for (let i = 0; i < TOTAL_REQUESTS; i++) {
    allRequests.push(generateRandomNFTRequest());
  }
  
  const startTime = Date.now();
  const results = [];
  
  // 分批併發執行
  for (let i = 0; i < allRequests.length; i += CONCURRENT_REQUESTS) {
    const batch = allRequests.slice(i, i + CONCURRENT_REQUESTS);
    
    console.log(`\n📦 執行批次 ${Math.floor(i / CONCURRENT_REQUESTS) + 1} (${batch.length} 個請求)`);
    
    const batchPromises = batch.map((request, index) => 
      sendRequest(request, i + index + 1)
    );
    
    const batchResults = await Promise.allSettled(batchPromises);
    
    batchResults.forEach(result => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          success: false,
          error: result.reason.message || 'Promise rejected',
          duration: 0
        });
      }
    });
    
    // 批次間短暫延遲
    if (i + CONCURRENT_REQUESTS < allRequests.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  const totalDuration = Date.now() - startTime;
  
  // 統計結果
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.length - successCount;
  const averageDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  const cachedCount = results.filter(r => r.cached && r.cached !== 'MISS').length;
  
  console.log('\n' + '=' * 60);
  console.log('📊 突發鑄造測試結果');
  console.log('=' * 60);
  console.log(`🎯 總請求數: ${results.length}`);
  console.log(`✅ 成功: ${successCount} (${(successCount/results.length*100).toFixed(1)}%)`);
  console.log(`❌ 失敗: ${failureCount} (${(failureCount/results.length*100).toFixed(1)}%)`);
  console.log(`⚡ 平均響應時間: ${averageDuration.toFixed(0)}ms`);
  console.log(`🔄 快取命中: ${cachedCount} (${(cachedCount/successCount*100).toFixed(1)}%)`);
  console.log(`⏱️ 總耗時: ${(totalDuration/1000).toFixed(1)}s`);
  console.log(`🚀 吞吐量: ${(results.length/(totalDuration/1000)).toFixed(1)} req/s`);
  
  // 響應時間分佈
  const sortedDurations = results.filter(r => r.success).map(r => r.duration).sort((a, b) => a - b);
  if (sortedDurations.length > 0) {
    const p50 = sortedDurations[Math.floor(sortedDurations.length * 0.5)];
    const p95 = sortedDurations[Math.floor(sortedDurations.length * 0.95)];
    const p99 = sortedDurations[Math.floor(sortedDurations.length * 0.99)];
    
    console.log('\n📈 響應時間分佈:');
    console.log(`   P50: ${p50}ms`);
    console.log(`   P95: ${p95}ms`);
    console.log(`   P99: ${p99}ms`);
    console.log(`   Max: ${Math.max(...sortedDurations)}ms`);
  }
  
  // 錯誤分析
  if (failureCount > 0) {
    console.log('\n❌ 錯誤分析:');
    const errorTypes = {};
    results.filter(r => !r.success).forEach(r => {
      const errorKey = r.error || `HTTP ${r.status}` || 'Unknown';
      errorTypes[errorKey] = (errorTypes[errorKey] || 0) + 1;
    });
    
    Object.entries(errorTypes).forEach(([error, count]) => {
      console.log(`   ${error}: ${count} 次`);
    });
  }
  
  console.log('\n🏁 測試完成');
}

// 檢查伺服器是否運行
async function checkServerHealth() {
  try {
    const response = await axios.get(`${SERVER_URL}/health`, { timeout: 5000 });
    if (response.status === 200) {
      console.log('✅ 伺服器健康檢查通過');
      return true;
    }
  } catch (error) {
    console.error('❌ 伺服器健康檢查失敗:', error.message);
    console.error('請確保伺服器運行在 http://localhost:3000');
    return false;
  }
}

// 主執行函數
async function main() {
  console.log('🧪 突發鑄造場景測試工具');
  console.log('測試伺服器在短時間內大量請求下的表現');
  console.log('');
  
  const serverReady = await checkServerHealth();
  if (!serverReady) {
    process.exit(1);
  }
  
  await runBurstTest();
}

// 錯誤處理
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// 開始測試
main().catch(console.error);