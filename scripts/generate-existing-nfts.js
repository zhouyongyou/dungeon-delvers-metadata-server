#!/usr/bin/env node

// 已鑄造 NFT 靜態文件生成器
// 只為已確認存在的 NFT 生成靜態文件，保持新鑄造的隨機性

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

class ExistingNFTGenerator {
  constructor() {
    this.outputDir = path.join(__dirname, '../static/metadata');
    this.serverUrl = 'http://localhost:3000';
    this.batchSize = 10; // 較小的批次避免伺服器過載
    this.delay = 1000;   // 請求間延遲 1 秒
  }

  async init() {
    console.log('🏗️ 初始化靜態文件生成器...');
    
    // 創建目錄結構
    await this.ensureDirectories();
    
    console.log(`📁 輸出目錄: ${this.outputDir}`);
  }

  async ensureDirectories() {
    const dirs = [
      this.outputDir,
      path.join(this.outputDir, 'hero'),
      path.join(this.outputDir, 'relic'), 
      path.join(this.outputDir, 'party'),
      path.join(this.outputDir, 'index')
    ];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
  }

  // 掃描已存在的 NFT（透過嘗試獲取 metadata）
  async scanExistingNFTs(type, maxTokenId = 1000) {
    console.log(`🔍 掃描已存在的 ${type} NFT (最多 ${maxTokenId} 個)...`);
    
    const existingNFTs = [];
    const errors = [];

    for (let tokenId = 1; tokenId <= maxTokenId; tokenId++) {
      try {
        // 檢查 NFT 是否存在
        const response = await axios.get(`${this.serverUrl}/api/${type}/${tokenId}`, {
          timeout: 10000,
          validateStatus: (status) => status < 500 // 404 是正常的（NFT 不存在）
        });

        if (response.status === 200) {
          const metadata = response.data;
          
          // 檢查是否是真實數據而非占位符
          if (metadata.source !== 'fallback' && metadata.metadata_status !== 'pending') {
            existingNFTs.push(tokenId);
            console.log(`✅ 發現 ${type} #${tokenId}`);
          } else {
            console.log(`⚠️ ${type} #${tokenId} 數據不完整，跳過`);
          }
        }

        // 延遲避免過載伺服器
        if (tokenId % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, this.delay));
          console.log(`📊 已掃描 ${tokenId}/${maxTokenId} 個 ${type}...`);
        }

      } catch (error) {
        if (error.response?.status === 404) {
          // NFT 不存在，正常情況
          console.log(`❌ ${type} #${tokenId} 不存在`);
        } else {
          errors.push({ tokenId, error: error.message });
          console.error(`💥 ${type} #${tokenId} 掃描錯誤: ${error.message}`);
        }
      }
    }

    console.log(`📋 ${type} 掃描完成: 發現 ${existingNFTs.length} 個已存在的 NFT`);
    if (errors.length > 0) {
      console.log(`⚠️ 掃描過程中有 ${errors.length} 個錯誤`);
    }

    return { existingNFTs, errors };
  }

  // 生成單個 NFT 的靜態文件
  async generateStaticFile(type, tokenId) {
    try {
      const filePath = path.join(this.outputDir, type, `${tokenId}.json`);
      
      // 檢查文件是否已存在且較新
      try {
        const stats = await fs.stat(filePath);
        const hourAgo = Date.now() - (60 * 60 * 1000);
        if (stats.mtime.getTime() > hourAgo) {
          console.log(`⏭️ ${type} #${tokenId} 靜態文件已是最新，跳過`);
          return true;
        }
      } catch (error) {
        // 文件不存在，繼續生成
      }

      // 從伺服器獲取 metadata
      console.log(`📥 獲取 ${type} #${tokenId} metadata...`);
      const response = await axios.get(`${this.serverUrl}/api/${type}/${tokenId}`, {
        timeout: 30000
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
      }

      const metadata = response.data;

      // 檢查數據品質
      if (metadata.source === 'fallback' || metadata.metadata_status === 'pending') {
        console.log(`⚠️ ${type} #${tokenId} 數據不完整，暫不生成靜態文件`);
        return false;
      }

      // 添加靜態文件標記
      const staticMetadata = {
        ...metadata,
        static_file: true,
        generated_at: new Date().toISOString(),
        cache_version: 'v1'
      };

      // 寫入靜態文件
      await fs.writeFile(filePath, JSON.stringify(staticMetadata, null, 2));
      
      console.log(`✅ 生成靜態文件: ${type} #${tokenId}`);
      return true;

    } catch (error) {
      console.error(`❌ 生成 ${type} #${tokenId} 靜態文件失敗: ${error.message}`);
      return false;
    }
  }

  // 批量生成靜態文件
  async generateBatch(type, tokenIds) {
    console.log(`🚀 開始批量生成 ${type} 靜態文件...`);
    console.log(`📊 總數: ${tokenIds.length} 個，批次大小: ${this.batchSize}`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < tokenIds.length; i += this.batchSize) {
      const batch = tokenIds.slice(i, i + this.batchSize);
      const batchIndex = Math.floor(i / this.batchSize) + 1;
      const totalBatches = Math.ceil(tokenIds.length / this.batchSize);

      console.log(`\n📦 處理批次 ${batchIndex}/${totalBatches} (${batch.length} 個 NFT)`);

      // 並行處理批次
      const results = await Promise.allSettled(
        batch.map(tokenId => this.generateStaticFile(type, tokenId))
      );

      // 統計結果
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          if (result.value) {
            successCount++;
          } else {
            failCount++;
          }
        } else {
          failCount++;
          console.error(`❌ 批次處理失敗: ${batch[index]} - ${result.reason}`);
        }
      });

      // 批次間延遲
      if (i + this.batchSize < tokenIds.length) {
        console.log(`⏸️ 批次間延遲 ${this.delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, this.delay));
      }
    }

    console.log(`\n🎯 ${type} 批量生成完成:`);
    console.log(`   ✅ 成功: ${successCount}`);
    console.log(`   ❌ 失敗: ${failCount}`);
    console.log(`   📊 成功率: ${(successCount/(successCount+failCount)*100).toFixed(1)}%`);

    return { successCount, failCount };
  }

  // 生成索引文件
  async generateIndexFiles(heroResults, relicResults, partyResults) {
    console.log('📋 生成索引文件...');

    const indexData = {
      generated_at: new Date().toISOString(),
      summary: {
        heroes: {
          total: heroResults.existingNFTs.length,
          generated: heroResults.successCount || 0
        },
        relics: {
          total: relicResults.existingNFTs.length, 
          generated: relicResults.successCount || 0
        },
        parties: {
          total: partyResults.existingNFTs.length,
          generated: partyResults.successCount || 0
        }
      },
      nft_lists: {
        heroes: heroResults.existingNFTs,
        relics: relicResults.existingNFTs,
        parties: partyResults.existingNFTs
      }
    };

    const indexPath = path.join(this.outputDir, 'index', 'summary.json');
    await fs.writeFile(indexPath, JSON.stringify(indexData, null, 2));

    console.log(`✅ 索引文件已生成: ${indexPath}`);
  }

  // 主執行函數
  async generate() {
    try {
      console.log('🎯 開始生成已鑄造 NFT 的靜態文件');
      console.log('=' * 60);

      await this.init();

      // 掃描已存在的 NFT
      console.log('\n🔍 第一階段：掃描已存在的 NFT');
      const heroScan = await this.scanExistingNFTs('hero', 500);
      const relicScan = await this.scanExistingNFTs('relic', 500);
      const partyScan = await this.scanExistingNFTs('party', 200);

      // 生成靜態文件
      console.log('\n🏭 第二階段：生成靜態文件');
      const heroGenerate = await this.generateBatch('hero', heroScan.existingNFTs);
      const relicGenerate = await this.generateBatch('relic', relicScan.existingNFTs);
      const partyGenerate = await this.generateBatch('party', partyScan.existingNFTs);

      // 生成索引
      console.log('\n📋 第三階段：生成索引文件');
      await this.generateIndexFiles(
        { ...heroScan, ...heroGenerate },
        { ...relicScan, ...relicGenerate },
        { ...partyScan, ...partyGenerate }
      );

      console.log('\n🎉 靜態文件生成完成！');
      console.log('=' * 60);
      console.log(`📁 文件位置: ${this.outputDir}`);
      console.log(`📊 總計生成: ${heroGenerate.successCount + relicGenerate.successCount + partyGenerate.successCount} 個靜態文件`);

    } catch (error) {
      console.error('💥 生成過程發生錯誤:', error);
      process.exit(1);
    }
  }
}

// 命令行執行
async function main() {
  const generator = new ExistingNFTGenerator();
  
  // 檢查伺服器是否運行
  try {
    await axios.get('http://localhost:3000/health', { timeout: 5000 });
    console.log('✅ 伺服器連接正常');
  } catch (error) {
    console.error('❌ 無法連接到伺服器 (http://localhost:3000)');
    console.error('請確保伺服器正在運行：npm run dev');
    process.exit(1);
  }

  await generator.generate();
}

// 錯誤處理
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// 如果直接執行
if (require.main === module) {
  main().catch(console.error);
}

module.exports = ExistingNFTGenerator;