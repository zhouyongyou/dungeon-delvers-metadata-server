// 後端 Alchemy RPC 智能管理器
// 支援自動故障轉移和負載均衡

class BackendRPCManager {
  constructor() {
    this.endpoints = [
      {
        url: 'https://bnb-mainnet.g.alchemy.com/v2/F7E3-HDwgUHDQvdICnFv_',
        key: 'F7E3-HDwgUHDQvdICnFv_',
        priority: 1,
        failures: 0
      },
      {
        url: 'https://bnb-mainnet.g.alchemy.com/v2/fB2BrBD6zFEhc6YoWxwuP5UQJ_ee-99M',
        key: 'fB2BrBD6zFEhc6YoWxwuP5UQJ_ee-99M',
        priority: 2,
        failures: 0
      },
      {
        url: 'https://bnb-mainnet.g.alchemy.com/v2/tiPlQVTwx4_2P98Pl7hb-LfzaTyi5HOn',
        key: 'tiPlQVTwx4_2P98Pl7hb-LfzaTyi5HOn',
        priority: 3,
        failures: 0
      },
      {
        url: 'https://bnb-mainnet.g.alchemy.com/v2/3lmTWjUVbFylAurhdU-rSUefTC-P4tKf',
        key: '3lmTWjUVbFylAurhdU-rSUefTC-P4tKf',
        priority: 4,
        failures: 0
      },
      {
        url: 'https://bnb-mainnet.g.alchemy.com/v2/QzXiHWkNRovjd_EeDRqVfR9rApUDiXRp',
        key: 'QzXiHWkNRovjd_EeDRqVfR9rApUDiXRp',
        priority: 5,
        failures: 0
      }
    ];
    
    this.maxFailures = 3;
    this.failureCooldown = 60000; // 1分鐘
    this.currentEndpoint = this.selectBestEndpoint();
  }

  selectBestEndpoint() {
    const now = Date.now();
    
    // 過濾可用端點
    const availableEndpoints = this.endpoints.filter(endpoint => {
      if (endpoint.failures < this.maxFailures) return true;
      if (!endpoint.lastFailure) return true;
      return now - endpoint.lastFailure > this.failureCooldown;
    });

    if (availableEndpoints.length === 0) {
      // 重置所有失敗計數
      this.endpoints.forEach(endpoint => {
        endpoint.failures = 0;
        endpoint.lastFailure = undefined;
      });
      return this.endpoints[0];
    }

    // 選擇優先級最高的可用端點
    return availableEndpoints.sort((a, b) => a.priority - b.priority)[0];
  }

  getCurrentRPC() {
    if (!this.currentEndpoint) {
      this.currentEndpoint = this.selectBestEndpoint();
    }
    return this.currentEndpoint.url;
  }

  reportFailure() {
    if (this.currentEndpoint) {
      this.currentEndpoint.failures++;
      this.currentEndpoint.lastFailure = Date.now();
      
      if (this.currentEndpoint.failures >= this.maxFailures) {
        console.warn(`⚠️ 後端 RPC 端點失敗過多，切換到備用端點: ${this.currentEndpoint.key}`);
        this.currentEndpoint = this.selectBestEndpoint();
      }
    }
  }

  async testEndpoint(endpoint) {
    const startTime = Date.now();
    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await response.json();
      
      const responseTime = Date.now() - startTime;
      endpoint.responseTime = responseTime;
      endpoint.failures = 0;
      return responseTime;
    } catch (error) {
      endpoint.failures++;
      endpoint.lastFailure = Date.now();
      throw error;
    }
  }

  async benchmarkEndpoints() {
    console.log('🚀 後端 Alchemy RPC 節點性能測試');
    
    for (const endpoint of this.endpoints) {
      try {
        const responseTime = await this.testEndpoint(endpoint);
        console.log(`✅ 後端 ${endpoint.key.slice(0, 8)}...: ${responseTime}ms`);
      } catch (error) {
        console.log(`❌ 後端 ${endpoint.key.slice(0, 8)}...: 失敗`);
      }
    }

    this.currentEndpoint = this.selectBestEndpoint();
    console.log(`🎯 後端選擇端點: ${this.currentEndpoint.key.slice(0, 8)}...`);
  }

  getStatus() {
    return {
      current: {
        key: this.currentEndpoint?.key,
        url: this.currentEndpoint?.url,
        failures: this.currentEndpoint?.failures,
        responseTime: this.currentEndpoint?.responseTime
      },
      endpoints: this.endpoints.map(ep => ({
        key: ep.key.slice(0, 8) + '...',
        priority: ep.priority,
        failures: ep.failures,
        responseTime: ep.responseTime,
        available: ep.failures < this.maxFailures
      }))
    };
  }
}

// 創建全局實例
const rpcManager = new BackendRPCManager();

// 初始化時進行性能測試
if (process.env.NODE_ENV !== 'production') {
  setTimeout(() => {
    rpcManager.benchmarkEndpoints();
  }, 1000);
}

module.exports = {
  getCurrentRPC: () => rpcManager.getCurrentRPC(),
  reportRPCFailure: () => rpcManager.reportFailure(),
  getRPCStatus: () => rpcManager.getStatus(),
  rpcManager
};