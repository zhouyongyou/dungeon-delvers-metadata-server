#!/usr/bin/env node

// 快速靜態文件生成器 - 針對已知存在的 50 個 NFT
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

async function generateStaticFiles() {
  console.log('🚀 開始生成前 50 個 NFT 的靜態文件');
  
  const serverUrl = 'http://localhost:3000';
  const outputDir = path.join(__dirname, 'static/metadata');
  
  // 確保目錄存在
  for (const type of ['hero', 'relic', 'party']) {
    const dir = path.join(outputDir, type);
    await fs.mkdir(dir, { recursive: true });
  }
  
  let generated = 0;
  
  // 為每個類型生成前 50 個
  for (const type of ['hero', 'relic', 'party']) {
    console.log(`\n🔄 生成 ${type} NFT 靜態文件...`);
    
    for (let i = 1; i <= 50; i++) {
      try {
        console.log(`📦 生成 ${type} #${i}...`);
        
        // 從 API 獲取 metadata
        const response = await axios.get(`${serverUrl}/api/${type}/${i}`, {
          timeout: 10000
        });
        
        if (response.status === 200) {
          const metadata = response.data;
          const filePath = path.join(outputDir, type, `${i}.json`);
          
          // 保存為靜態文件
          await fs.writeFile(filePath, JSON.stringify(metadata, null, 2));
          
          console.log(`✅ ${type} #${i} 已生成`);
          generated++;
        }
        
        // 小延遲避免過載
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`❌ ${type} #${i} 生成失敗: ${error.message}`);
      }
    }
  }
  
  console.log(`\n🎉 完成！總共生成了 ${generated} 個靜態文件`);
  
  // 驗證生成結果
  for (const type of ['hero', 'relic', 'party']) {
    const dir = path.join(outputDir, type);
    const files = await fs.readdir(dir);
    console.log(`📊 ${type}: ${files.length} 個文件`);
  }
}

generateStaticFiles().catch(console.error);