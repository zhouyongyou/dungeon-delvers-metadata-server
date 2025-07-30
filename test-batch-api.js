#!/usr/bin/env node

// 批量 API 測試腳本
const fetch = require('node-fetch');

const BASE_URL = process.env.API_URL || 'https://dungeon-delvers-metadata-server.onrender.com';

async function testBatchAPI() {
  console.log('🧪 開始測試批量 API...\n');
  
  // 測試數據 - 混合不同類型的 NFT
  const testRequests = [
    { type: 'hero', tokenId: '1' },
    { type: 'hero', tokenId: '51' },
    { type: 'hero', tokenId: '100' },
    { type: 'relic', tokenId: '1' },
    { type: 'relic', tokenId: '51' },
    { type: 'relic', tokenId: '100' },
    { type: 'party', tokenId: '1' },
    { type: 'party', tokenId: '10' }
  ];
  
  try {
    console.log(`📡 發送批量請求到: ${BASE_URL}/api/batch`);
    console.log(`📋 請求 ${testRequests.length} 個 NFT:`, testRequests);
    
    const startTime = Date.now();
    
    const response = await fetch(`${BASE_URL}/api/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BatchAPI-Test/1.0'
      },
      body: JSON.stringify({
        requests: testRequests
      })
    });
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    console.log(`⏱️  響應時間: ${responseTime}ms`);
    console.log(`📊 HTTP 狀態: ${response.status} ${response.statusText}`);
    
    // 檢查響應頭
    console.log('\n📋 響應頭:');
    console.log(`Cache-Control: ${response.headers.get('Cache-Control')}`);
    console.log(`X-Batch-Size: ${response.headers.get('X-Batch-Size')}`);
    console.log(`X-Success-Count: ${response.headers.get('X-Success-Count')}`);
    console.log(`X-Failure-Count: ${response.headers.get('X-Failure-Count')}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log('\n✅ 批量查詢結果:');
    console.log(`📊 總計: ${data.total}, 成功: ${data.successful}, 失敗: ${data.failed}`);
    
    // 顯示詳細結果
    data.results.forEach((result, index) => {
      if (result.success) {
        console.log(`\n${index + 1}. ✅ ${result.type.toUpperCase()} #${result.tokenId}`);
        console.log(`   名稱: ${result.data.name}`);
        console.log(`   圖片: ${result.data.image}`);
        console.log(`   屬性: ${result.data.attributes.map(attr => `${attr.trait_type}=${attr.value}`).join(', ')}`);
        console.log(`   來源: ${result.data.source}`);
      } else {
        console.log(`\n${index + 1}. ❌ ${result.type.toUpperCase()} #${result.tokenId}`);
        console.log(`   錯誤: ${result.error}`);
      }
    });
    
    // 性能分析
    const avgTimePerNft = responseTime / testRequests.length;
    console.log(`\n📈 性能分析:`);
    console.log(`   平均每個 NFT: ${avgTimePerNft.toFixed(2)}ms`);
    console.log(`   成功率: ${((data.successful / data.total) * 100).toFixed(1)}%`);
    
    if (avgTimePerNft < 100) {
      console.log(`🚀 性能優秀！每個 NFT 平均響應時間 < 100ms`);
    } else if (avgTimePerNft < 300) {
      console.log(`✅ 性能良好！每個 NFT 平均響應時間 < 300ms`);
    } else {
      console.log(`⚠️  性能需要優化，每個 NFT 平均響應時間 > 300ms`);
    }
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
    process.exit(1);
  }
}

// 錯誤處理測試
async function testErrorHandling() {
  console.log('\n🧪 測試錯誤處理...\n');
  
  // 測試無效請求格式
  const invalidTests = [
    {
      name: '空請求數組',
      body: { requests: [] }
    },
    {
      name: '超大批量',
      body: { requests: Array(150).fill().map((_, i) => ({ type: 'hero', tokenId: i + 1 })) }
    },
    {
      name: '無效 NFT 類型',
      body: { requests: [{ type: 'invalid', tokenId: '1' }] }
    },
    {
      name: '缺少 tokenId',
      body: { requests: [{ type: 'hero' }] }
    }
  ];
  
  for (const test of invalidTests) {
    try {
      console.log(`🔍 測試: ${test.name}`);
      
      const response = await fetch(`${BASE_URL}/api/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test.body)
      });
      
      const data = await response.json();
      
      if (response.status === 400) {
        console.log(`✅ 正確返回 400 錯誤: ${data.message}`);
      } else {
        console.log(`⚠️  預期 400 錯誤，但得到 ${response.status}`);
      }
      
    } catch (error) {
      console.error(`❌ ${test.name} 測試失敗:`, error.message);
    }
  }
}

// 主函數
async function main() {
  console.log('🔬 DungeonDelvers 批量 API 測試套件\n');
  
  await testBatchAPI();
  await testErrorHandling();
  
  console.log('\n🎉 所有測試完成！');
}

main().catch(console.error);