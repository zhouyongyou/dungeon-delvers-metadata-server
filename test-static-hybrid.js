#!/usr/bin/env node

// 混合靜態化方案測試腳本
// 測試靜態文件生成、路由優先策略和性能表現

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class StaticHybridTester {
  constructor() {
    this.serverUrl = 'http://localhost:3000';
    this.testResults = {
      static_file_tests: [],
      dynamic_fallback_tests: [],
      performance_tests: [],
      api_tests: []
    };
  }

  async runAllTests() {
    console.log('🧪 混合靜態化方案測試開始');
    console.log('=' * 60);

    try {
      // 1. 測試伺服器連接
      await this.testServerConnection();

      // 2. 測試靜態文件 API
      await this.testStaticFileAPI();

      // 3. 測試混合路由（如果有靜態文件的話）
      await this.testHybridRouting();

      // 4. 測試性能對比
      await this.testPerformanceComparison();

      // 5. 測試動態回退機制
      await this.testDynamicFallback();

      // 6. 生成測試報告
      await this.generateTestReport();

    } catch (error) {
      console.error('💥 測試過程中發生錯誤:', error);
      process.exit(1);
    }
  }

  async testServerConnection() {
    console.log('\n🔗 測試 1: 伺服器連接');

    try {
      const response = await axios.get(`${this.serverUrl}/health`, { timeout: 5000 });
      if (response.status === 200) {
        console.log('✅ 伺服器連接正常');
        console.log(`📊 版本: ${response.data.version}`);
        console.log(`⚡ 運行時間: ${response.data.uptime.toFixed(1)}s`);
      } else {
        throw new Error(`伺服器響應異常: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ 伺服器連接失敗:', error.message);
      throw error;
    }
  }

  async testStaticFileAPI() {
    console.log('\n📊 測試 2: 靜態文件 API');

    try {
      const response = await axios.get(`${this.serverUrl}/api/static/health`);
      
      if (response.status === 200) {
        const data = response.data;
        console.log('✅ 靜態文件 API 正常');
        console.log(`📈 命中率: ${data.static_files.metrics.hit_rate}`);
        console.log(`📊 總請求: ${data.static_files.metrics.total_requests}`);
        console.log(`⚡ 狀態: ${data.static_files.status}`);

        this.testResults.api_tests.push({
          test: 'static_file_api',
          success: true,
          hit_rate: data.static_files.metrics.hit_rate_numeric,
          total_requests: data.static_files.metrics.total_requests
        });
      }
    } catch (error) {
      console.error('❌ 靜態文件 API 測試失敗:', error.message);
      this.testResults.api_tests.push({
        test: 'static_file_api',
        success: false,
        error: error.message
      });
    }
  }

  async testHybridRouting() {
    console.log('\n🔀 測試 3: 混合路由策略');

    const testCases = [
      { type: 'hero', tokenId: '1' },
      { type: 'hero', tokenId: '10' },
      { type: 'relic', tokenId: '1' },
      { type: 'relic', tokenId: '5' },
      { type: 'party', tokenId: '1' }
    ];

    for (const testCase of testCases) {
      try {
        const startTime = Date.now();
        const response = await axios.get(`${this.serverUrl}/api/${testCase.type}/${testCase.tokenId}`, {
          timeout: 10000
        });
        const responseTime = Date.now() - startTime;

        if (response.status === 200) {
          const isStaticHit = response.headers['x-cache-status'] === 'STATIC-HIT';
          const source = response.headers['x-source'] || 'unknown';
          
          console.log(`✅ ${testCase.type} #${testCase.tokenId}: ${responseTime}ms (${isStaticHit ? '靜態' : '動態'})`);
          
          this.testResults.static_file_tests.push({
            type: testCase.type,
            tokenId: testCase.tokenId,
            responseTime,
            isStaticHit,
            source,
            success: true
          });
        }
      } catch (error) {
        console.log(`❌ ${testCase.type} #${testCase.tokenId}: ${error.message}`);
        this.testResults.static_file_tests.push({
          type: testCase.type,
          tokenId: testCase.tokenId,
          success: false,
          error: error.message
        });
      }
    }
  }

  async testPerformanceComparison() {
    console.log('\n⚡ 測試 4: 性能對比測試');

    const testNFT = { type: 'hero', tokenId: '1' };
    const requestCount = 10;

    console.log(`🎯 測試 ${testNFT.type} #${testNFT.tokenId} 的響應時間 (${requestCount} 次請求)`);

    const responseTimes = [];

    for (let i = 0; i < requestCount; i++) {
      try {
        const startTime = Date.now();
        const response = await axios.get(`${this.serverUrl}/api/${testNFT.type}/${testNFT.tokenId}`);
        const responseTime = Date.now() - startTime;

        if (response.status === 200) {
          responseTimes.push({
            attempt: i + 1,
            time: responseTime,
            isStatic: response.headers['x-cache-status'] === 'STATIC-HIT'
          });
          console.log(`📊 請求 ${i + 1}: ${responseTime}ms (${response.headers['x-cache-status'] || 'UNKNOWN'})`);
        }
      } catch (error) {
        console.error(`❌ 請求 ${i + 1} 失敗:`, error.message);
      }

      // 請求間短暫延遲
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (responseTimes.length > 0) {
      const avgTime = responseTimes.reduce((sum, r) => sum + r.time, 0) / responseTimes.length;
      const staticRequests = responseTimes.filter(r => r.isStatic);
      const dynamicRequests = responseTimes.filter(r => !r.isStatic);

      console.log(`\n📈 性能統計:`);
      console.log(`   平均響應時間: ${avgTime.toFixed(1)}ms`);
      console.log(`   靜態請求: ${staticRequests.length}/${responseTimes.length}`);
      if (staticRequests.length > 0) {
        const staticAvg = staticRequests.reduce((sum, r) => sum + r.time, 0) / staticRequests.length;
        console.log(`   靜態平均時間: ${staticAvg.toFixed(1)}ms`);
      }
      if (dynamicRequests.length > 0) {
        const dynamicAvg = dynamicRequests.reduce((sum, r) => sum + r.time, 0) / dynamicRequests.length;
        console.log(`   動態平均時間: ${dynamicAvg.toFixed(1)}ms`);
      }

      this.testResults.performance_tests.push({
        test_nft: testNFT,
        request_count: requestCount,
        avg_response_time: avgTime,
        static_requests: staticRequests.length,
        dynamic_requests: dynamicRequests.length,
        static_avg_time: staticRequests.length > 0 ? staticRequests.reduce((sum, r) => sum + r.time, 0) / staticRequests.length : null,
        dynamic_avg_time: dynamicRequests.length > 0 ? dynamicRequests.reduce((sum, r) => sum + r.time, 0) / dynamicRequests.length : null
      });
    }
  }

  async testDynamicFallback() {
    console.log('\n🔄 測試 5: 動態回退機制');

    // 測試不存在的 NFT（應該動態生成 fallback）
    const fallbackTests = [
      { type: 'hero', tokenId: '99999' },
      { type: 'relic', tokenId: '88888' },
      { type: 'party', tokenId: '77777' }
    ];

    for (const testCase of fallbackTests) {
      try {
        const startTime = Date.now();
        const response = await axios.get(`${this.serverUrl}/api/${testCase.type}/${testCase.tokenId}`, {
          timeout: 15000
        });
        const responseTime = Date.now() - startTime;

        if (response.status === 200) {
          const isStatic = response.headers['x-cache-status'] === 'STATIC-HIT';
          const source = response.data.source || 'unknown';
          
          console.log(`✅ ${testCase.type} #${testCase.tokenId}: ${responseTime}ms (source: ${source}, ${isStatic ? '靜態' : '動態'})`);
          
          this.testResults.dynamic_fallback_tests.push({
            type: testCase.type,
            tokenId: testCase.tokenId,
            responseTime,
            source,
            isStatic,
            success: true
          });
        }
      } catch (error) {
        console.log(`❌ ${testCase.type} #${testCase.tokenId}: ${error.message}`);
        this.testResults.dynamic_fallback_tests.push({
          type: testCase.type,
          tokenId: testCase.tokenId,
          success: false,
          error: error.message
        });
      }
    }
  }

  async generateTestReport() {
    console.log('\n📋 測試報告生成');

    const report = {
      test_timestamp: new Date().toISOString(),
      summary: {
        static_file_tests: {
          total: this.testResults.static_file_tests.length,
          successful: this.testResults.static_file_tests.filter(t => t.success).length,
          static_hits: this.testResults.static_file_tests.filter(t => t.isStaticHit).length
        },
        dynamic_fallback_tests: {
          total: this.testResults.dynamic_fallback_tests.length,
          successful: this.testResults.dynamic_fallback_tests.filter(t => t.success).length
        },
        performance_tests: this.testResults.performance_tests.length,
        api_tests: {
          total: this.testResults.api_tests.length,
          successful: this.testResults.api_tests.filter(t => t.success).length
        }
      },
      details: this.testResults
    };

    // 寫入報告文件
    const reportPath = path.join(__dirname, 'test-results', `static-hybrid-test-${Date.now()}.json`);
    
    try {
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      console.log(`📄 測試報告已保存: ${reportPath}`);
    } catch (error) {
      console.error('❌ 保存測試報告失敗:', error.message);
    }

    // 控制台總結
    console.log('\n' + '=' * 60);
    console.log('📊 測試總結');
    console.log('=' * 60);
    console.log(`🎯 靜態文件測試: ${report.summary.static_file_tests.successful}/${report.summary.static_file_tests.total} 成功`);
    console.log(`⚡ 靜態命中: ${report.summary.static_file_tests.static_hits}/${report.summary.static_file_tests.total}`);
    console.log(`🔄 動態回退測試: ${report.summary.dynamic_fallback_tests.successful}/${report.summary.dynamic_fallback_tests.total} 成功`);
    console.log(`📈 性能測試: ${report.summary.performance_tests} 組完成`);
    console.log(`🔌 API 測試: ${report.summary.api_tests.successful}/${report.summary.api_tests.total} 成功`);

    if (this.testResults.performance_tests.length > 0) {
      const perfTest = this.testResults.performance_tests[0];
      console.log(`\n⚡ 性能表現:`);
      console.log(`   平均響應時間: ${perfTest.avg_response_time.toFixed(1)}ms`);
      if (perfTest.static_avg_time) {
        console.log(`   靜態文件: ${perfTest.static_avg_time.toFixed(1)}ms`);
      }
      if (perfTest.dynamic_avg_time) {
        console.log(`   動態生成: ${perfTest.dynamic_avg_time.toFixed(1)}ms`);
      }
    }

    console.log('\n🏁 測試完成');
  }
}

// 主執行函數
async function main() {
  const tester = new StaticHybridTester();
  await tester.runAllTests();
}

// 錯誤處理
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

if (require.main === module) {
  main().catch(console.error);
}