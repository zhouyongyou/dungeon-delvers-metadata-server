// update-new-contracts.js - 更新 metadata server 到新合約地址
const fs = require('fs');
const path = require('path');

// 🎉 全新部署的合約地址 - 2025年1月14日
const NEW_CONTRACTS = {
  hero: '0x4EFc389f5DE5DfBd0c8B158a2ea41B611aA30CDb',
  relic: '0x235d53Efd9cc5aB66F2C3B1E496Ab25767D673e0',
  party: '0x5DC3175b6a1a5bB4Ec7846e8413257aB7CF31834',
  vip: '0x067F289Ae4e76CB61b8a138bF705798a928a12FB',
  playerprofile: '0xd6385bc4099c2713383eD5cB9C6d10E750ADe312'
};

console.log('🚀 更新 metadata server 到新的合約地址...');

// 更新 src/index.js
const indexPath = path.join(__dirname, 'src/index.js');
if (fs.existsSync(indexPath)) {
  let content = fs.readFileSync(indexPath, 'utf8');
  
  console.log('📝 更新 src/index.js 中的合約地址：');
  
  // 查找 CONTRACTS 對象並替換
  const contractsRegex = /const CONTRACTS = \{[\s\S]*?\};/;
  const newContracts = `const CONTRACTS = {
  hero: '${NEW_CONTRACTS.hero}',
  relic: '${NEW_CONTRACTS.relic}',
  party: '${NEW_CONTRACTS.party}',
  vip: '${NEW_CONTRACTS.vip}',
  playerprofile: '${NEW_CONTRACTS.playerprofile}'
};`;

  if (content.match(contractsRegex)) {
    content = content.replace(contractsRegex, newContracts);
    fs.writeFileSync(indexPath, content);
    console.log('✅ src/index.js 已更新');
    
    // 顯示更新的地址
    Object.entries(NEW_CONTRACTS).forEach(([name, address]) => {
      console.log(`   ${name}: ${address}`);
    });
  } else {
    console.log('❌ 找不到 CONTRACTS 對象');
  }
} else {
  console.log('❌ 找不到 src/index.js 文件');
}

// 更新 .env 文件
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  console.log('\n📝 更新 .env 文件中的合約地址：');
  
  // 更新環境變量
  const updates = {
    'VITE_MAINNET_HERO_ADDRESS': NEW_CONTRACTS.hero,
    'VITE_MAINNET_RELIC_ADDRESS': NEW_CONTRACTS.relic,
    'VITE_MAINNET_PARTY_ADDRESS': NEW_CONTRACTS.party,
    'VITE_MAINNET_VIPSTAKING_ADDRESS': NEW_CONTRACTS.vip,
    'VITE_MAINNET_PLAYERPROFILE_ADDRESS': NEW_CONTRACTS.playerprofile
  };
  
  Object.entries(updates).forEach(([key, value]) => {
    const regex = new RegExp(`${key}=.*`, 'g');
    if (envContent.match(regex)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
      console.log(`   ✅ ${key}=${value}`);
    } else {
      // 如果不存在，添加到文件末尾
      envContent += `\n${key}=${value}`;
      console.log(`   ➕ ${key}=${value}`);
    }
  });
  
  fs.writeFileSync(envPath, envContent);
  console.log('✅ .env 文件已更新');
} else {
  console.log('❌ 找不到 .env 文件');
}

console.log('\n🎉 Metadata server 更新完成！');
console.log('\n📋 接下來的步驟：');
console.log('====================================');
console.log('1. 提交更改到 Git：');
console.log('   git add -A');
console.log('   git commit -m "Update to new contract addresses (2025-01-14)"');
console.log('   git push');
console.log('');
console.log('2. 等待 Render 自動部署（約 3-5 分鐘）');
console.log('');
console.log('3. 測試 metadata API：');
console.log('   curl https://dungeon-delvers-metadata-server.onrender.com/api/hero/1');
console.log('');
console.log('⚠️  部署完成後，所有 NFT 將顯示新的合約數據！');