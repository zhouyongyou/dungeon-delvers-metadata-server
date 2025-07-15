#!/usr/bin/env node

// 測試 RPC 代理功能
const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

async function testRpcProxy() {
  console.log('🔍 測試 RPC 代理功能...');
  console.log(`後端 URL: ${BACKEND_URL}`);
  
  try {
    // 1. 測試健康狀態
    console.log('\n1. 檢查 RPC 節點狀態...');
    const statusResponse = await axios.get(`${BACKEND_URL}/api/rpc/status`);
    console.log('✅ RPC 節點狀態:', statusResponse.data.summary);
    console.log('🎯 最佳節點:', statusResponse.data.bestNode);
    
    // 2. 測試 RPC 代理請求
    console.log('\n2. 測試區塊號查詢...');
    const rpcResponse = await axios.post(`${BACKEND_URL}/api/rpc`, {
      jsonrpc: '2.0',
      method: 'eth_blockNumber',
      params: [],
      id: 1
    });
    
    if (rpcResponse.data && rpcResponse.data.result) {
      const blockNumber = parseInt(rpcResponse.data.result, 16);
      console.log('✅ RPC 代理成功！當前區塊號:', blockNumber);
    } else {
      console.log('❌ RPC 代理失敗:', rpcResponse.data);
    }
    
    // 3. 測試 Gas Price 查詢
    console.log('\n3. 測試 Gas Price 查詢...');
    const gasPriceResponse = await axios.post(`${BACKEND_URL}/api/rpc`, {
      jsonrpc: '2.0',
      method: 'eth_gasPrice',
      params: [],
      id: 2
    });
    
    if (gasPriceResponse.data && gasPriceResponse.data.result) {
      const gasPrice = parseInt(gasPriceResponse.data.result, 16);
      console.log('✅ Gas Price 查詢成功:', gasPrice, 'wei');
    } else {
      console.log('❌ Gas Price 查詢失敗:', gasPriceResponse.data);
    }
    
    console.log('\n🎉 RPC 代理測試完成！');
    
  } catch (error) {
    console.error('❌ 測試失敗:', error.message);
    if (error.response) {
      console.error('錯誤詳情:', error.response.data);
    }
  }
}

// 執行測試
if (require.main === module) {
  testRpcProxy();
}

module.exports = { testRpcProxy };