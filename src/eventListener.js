// 新鑄造 NFT 事件監聽器
// 監聽合約事件，檢測新鑄造的 NFT 並觸發相應處理

const { ethers } = require('ethers');
const fs = require('fs').promises;
const path = require('path');

class NFTEventListener {
  constructor(provider, contracts, config = {}) {
    this.provider = provider;
    this.contracts = contracts;
    this.config = {
      enableEventListening: config.enableEventListening !== false,
      staticFileGeneration: config.staticFileGeneration !== false,
      eventLogFile: config.eventLogFile || 'nft-events.log',
      recentMintWindow: config.recentMintWindow || 5 * 60 * 1000, // 5 分鐘
      ...config
    };
    
    this.recentMints = [];
    this.eventHandlers = new Map();
    this.isListening = false;
    
    console.log('🎧 NFT Event Listener 初始化完成');
  }

  // 初始化事件監聽
  async startListening() {
    if (!this.config.enableEventListening || this.isListening) {
      return;
    }

    console.log('🚀 開始監聽 NFT 鑄造事件...');

    try {
      // 監聽 Hero NFT 鑄造事件
      if (this.contracts.hero) {
        await this.setupContractListener('hero', this.contracts.hero);
      }

      // 監聽 Relic NFT 鑄造事件
      if (this.contracts.relic) {
        await this.setupContractListener('relic', this.contracts.relic);
      }

      // 監聽 Party NFT 鑄造事件
      if (this.contracts.party) {
        await this.setupContractListener('party', this.contracts.party);
      }

      this.isListening = true;
      console.log('✅ NFT 事件監聽已啟動');

    } catch (error) {
      console.error('❌ 啟動事件監聽失敗:', error);
      throw error;
    }
  }

  // 設置單個合約的事件監聽
  async setupContractListener(type, contractAddress) {
    try {
      // 創建合約實例 - 使用通用 ERC721 ABI
      const erc721ABI = [
        'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
      ];
      
      const contract = new ethers.Contract(contractAddress, erc721ABI, this.provider);

      // 監聽 Transfer 事件（from = 0x0 表示鑄造）
      contract.on('Transfer', async (from, to, tokenId, event) => {
        // 檢查是否為鑄造事件
        if (from === ethers.ZeroAddress) {
          await this.handleNewMint(type, tokenId.toString(), to, event);
        }
      });

      console.log(`🎯 ${type} 合約事件監聽已設置: ${contractAddress}`);

    } catch (error) {
      console.error(`❌ 設置 ${type} 合約監聽失敗:`, error);
      throw error;
    }
  }

  // 處理新鑄造事件
  async handleNewMint(type, tokenId, owner, event) {
    const mintData = {
      type,
      tokenId,
      owner,
      timestamp: Date.now(),
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash
    };

    try {
      console.log(`🔥 檢測到新鑄造: ${type} #${tokenId} -> ${owner}`);
      
      // 記錄到最近鑄造列表
      this.recentMints.push(mintData);
      this.cleanupRecentMints();

      // 記錄事件日誌
      await this.logEvent(mintData);

      // 檢查是否觸發突發鑄造
      const burstDetected = this.detectBurstMinting();
      if (burstDetected) {
        console.log(`🚨 檢測到突發鑄造: ${this.recentMints.length} 個 NFT 在 ${this.config.recentMintWindow/1000} 秒內`);
        await this.handleBurstMinting();
      }

      // 觸發新鑄造處理
      await this.processNewMint(mintData);

      // 異步生成靜態文件（不阻塞）
      if (this.config.staticFileGeneration) {
        setImmediate(() => {
          this.generateStaticFileAsync(type, tokenId).catch(error => {
            console.error(`❌ 異步生成靜態文件失敗: ${type} #${tokenId}`, error);
          });
        });
      }

    } catch (error) {
      console.error(`❌ 處理新鑄造事件失敗: ${type} #${tokenId}`, error);
    }
  }

  // 清理過期的最近鑄造記錄
  cleanupRecentMints() {
    const now = Date.now();
    const cutoff = now - this.config.recentMintWindow;
    
    this.recentMints = this.recentMints.filter(mint => mint.timestamp > cutoff);
  }

  // 檢測突發鑄造
  detectBurstMinting() {
    // 可以根據需要調整突發檢測邏輯
    const burstThreshold = 20; // 5分鐘內超過 20 個算突發
    return this.recentMints.length >= burstThreshold;
  }

  // 處理突發鑄造
  async handleBurstMinting() {
    console.log('🚨 啟動突發鑄造處理模式...');
    
    // 可以在這裡觸發預熱系統的突發模式
    // 或者發送通知給管理員
    
    // 觸發自定義處理器（如果有註冊）
    const handler = this.eventHandlers.get('burst-minting');
    if (handler) {
      try {
        await handler(this.recentMints);
      } catch (error) {
        console.error('❌ 突發鑄造處理器錯誤:', error);
      }
    }
  }

  // 處理單個新鑄造
  async processNewMint(mintData) {
    // 觸發新鑄造處理器（如果有註冊）
    const handler = this.eventHandlers.get('new-mint');
    if (handler) {
      try {
        await handler(mintData);
      } catch (error) {
        console.error('❌ 新鑄造處理器錯誤:', error);
      }
    }
  }

  // 異步生成靜態文件
  async generateStaticFileAsync(type, tokenId) {
    try {
      console.log(`📝 開始異步生成 ${type} #${tokenId} 靜態文件...`);
      
      // 等待一段時間讓數據穩定
      await new Promise(resolve => setTimeout(resolve, 10000)); // 等待 10 秒
      
      // 從本地服務器獲取 metadata
      const axios = require('axios');
      const response = await axios.get(`http://localhost:3000/api/${type}/${tokenId}`, {
        timeout: 30000
      });

      if (response.status === 200 && response.data.source !== 'fallback') {
        const metadata = {
          ...response.data,
          static_file: true,
          generated_at: new Date().toISOString(),
          generated_from_event: true
        };

        // 確保目錄存在
        const staticDir = path.join(__dirname, '../static/metadata', type);
        await fs.mkdir(staticDir, { recursive: true });

        // 寫入靜態文件
        const filePath = path.join(staticDir, `${tokenId}.json`);
        await fs.writeFile(filePath, JSON.stringify(metadata, null, 2));

        console.log(`✅ 異步生成靜態文件完成: ${type} #${tokenId}`);
      } else {
        console.log(`⚠️ ${type} #${tokenId} 數據尚未穩定，暫不生成靜態文件`);
      }

    } catch (error) {
      console.error(`❌ 異步生成 ${type} #${tokenId} 靜態文件失敗:`, error.message);
    }
  }

  // 記錄事件日誌
  async logEvent(mintData) {
    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        ...mintData
      };

      const logPath = path.join(__dirname, '../logs', this.config.eventLogFile);
      
      // 確保日誌目錄存在
      await fs.mkdir(path.dirname(logPath), { recursive: true });
      
      // 追加日誌
      await fs.appendFile(logPath, JSON.stringify(logEntry) + '\n');

    } catch (error) {
      console.error('❌ 記錄事件日誌失敗:', error);
    }
  }

  // 註冊事件處理器
  registerHandler(eventType, handler) {
    this.eventHandlers.set(eventType, handler);
    console.log(`📝 已註冊 ${eventType} 事件處理器`);
  }

  // 停止監聽
  async stopListening() {
    if (!this.isListening) return;

    console.log('🛑 停止 NFT 事件監聽...');
    
    // 移除所有監聽器
    if (this.contracts.hero) {
      const heroContract = new ethers.Contract(this.contracts.hero, ['event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'], this.provider);
      heroContract.removeAllListeners();
    }

    if (this.contracts.relic) {
      const relicContract = new ethers.Contract(this.contracts.relic, ['event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'], this.provider);
      relicContract.removeAllListeners();
    }

    if (this.contracts.party) {
      const partyContract = new ethers.Contract(this.contracts.party, ['event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'], this.provider);
      partyContract.removeAllListeners();
    }

    this.isListening = false;
    console.log('✅ NFT 事件監聽已停止');
  }

  // 獲取統計數據
  getStats() {
    return {
      isListening: this.isListening,
      recentMintsCount: this.recentMints.length,
      recentMints: this.recentMints.slice(-10), // 最近 10 個
      handlersRegistered: Array.from(this.eventHandlers.keys())
    };
  }
}

module.exports = NFTEventListener;