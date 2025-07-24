// configLoader.js - 後端配置載入器
// 從遠端載入合約地址，減少環境變數依賴

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class ConfigLoader {
  constructor() {
    this.config = null;
    // 開發環境使用本地文件，生產環境使用 CDN
    if (process.env.NODE_ENV === 'development' || !process.env.CONFIG_URL) {
      // 嘗試使用本地前端的配置文件
      this.configUrl = 'file:///Users/sotadic/Documents/GitHub/DungeonDelvers/public/config/v19.json';
    } else {
      this.configUrl = process.env.CONFIG_URL || 'https://dungeondelvers.xyz/config/v19.json';
    }
    this.lastFetch = 0;
    this.cacheDuration = 5 * 60 * 1000; // 5 分鐘緩存
  }

  async loadConfig() {
    const now = Date.now();
    
    // 使用緩存
    if (this.config && (now - this.lastFetch) < this.cacheDuration) {
      return this.config;
    }

    try {
      console.log('Loading configuration from:', this.configUrl);
      
      let data;
      
      // 處理本地文件
      if (this.configUrl.startsWith('file://')) {
        const filePath = this.configUrl.replace('file://', '');
        if (fs.existsSync(filePath)) {
          const fileContent = fs.readFileSync(filePath, 'utf8');
          data = JSON.parse(fileContent);
          console.log('Loaded from local file');
        } else {
          throw new Error(`Local file not found: ${filePath}`);
        }
      } else {
        // 處理遠端 URL
        const response = await axios.get(this.configUrl, { timeout: 5000 });
        data = response.data;
      }
      
      // 轉換合約地址格式
      const contracts = {};
      if (data.contracts && data.contracts.mainnet) {
        // 新格式：從 contracts.mainnet 載入（如主配置文件）
        Object.entries(data.contracts.mainnet).forEach(([key, value]) => {
          contracts[key] = value;
        });
      } else if (data.contracts) {
        // 前端配置格式：直接從 contracts 載入並轉換為 _ADDRESS 格式
        Object.entries(data.contracts).forEach(([key, value]) => {
          // 如果 key 沒有 _ADDRESS 後綴，則添加
          const addressKey = key.endsWith('_ADDRESS') ? key : `${key}_ADDRESS`;
          contracts[addressKey] = value;
          
          // 同時保存原始格式，以便支援不同的查找方式
          contracts[key] = value;
        });
      }
      
      this.config = {
        version: data.version,
        contracts,
        subgraph: data.subgraph,
        network: data.network
      };
      
      this.lastFetch = now;
      console.log(`Configuration loaded: Version ${this.config.version}`);
      
      return this.config;
    } catch (error) {
      console.error('Failed to load remote config:', error.message);
      
      // 使用環境變數作為備份
      if (!this.config) {
        console.log('Using environment variables as fallback');
        return this.loadFromEnv();
      }
      
      // 返回緩存的配置
      return this.config;
    }
  }

  loadFromEnv() {
    const contracts = {};
    
    // 從環境變數載入所有 *_ADDRESS
    Object.keys(process.env).forEach(key => {
      if (key.endsWith('_ADDRESS')) {
        contracts[key] = process.env[key];
      }
    });
    
    return {
      version: process.env.VERSION || 'Unknown',
      contracts,
      subgraph: {
        url: process.env.THE_GRAPH_API_URL
      }
    };
  }

  async getContract(name) {
    const config = await this.loadConfig();
    const key = `${name.toUpperCase()}_ADDRESS`;
    return config.contracts[key];
  }

  async getAllContracts() {
    const config = await this.loadConfig();
    return config.contracts;
  }
}

// 單例模式
const configLoader = new ConfigLoader();

module.exports = configLoader;