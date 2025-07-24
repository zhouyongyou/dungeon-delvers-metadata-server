// update-to-v19.js - Update metadata server to V19 contract addresses
const fs = require('fs');
const path = require('path');

// V19 contract addresses (from subgraph update)
const V19_CONTRACTS = {
  // Core NFT contracts
  HERO_ADDRESS: '0x141F081922D4015b3157cdA6eE970dff34bb8AAb',
  RELIC_ADDRESS: '0xB1eb505426e852B8Dca4BF41454a7A22D2B6F3D3',
  PARTY_ADDRESS: '0xf240c4fD2651Ba41ff09eB26eE01b21f42dD9957',
  
  // Game contracts
  DUNGEONMASTER_ADDRESS: '0xd34ddc336071FE7Da3c636C3Df7C3BCB77B1044a',
  VIPSTAKING_ADDRESS: '0x43A6C6cC9D15f2C68C7ec98deb01f2b69a618470',
  PLAYERPROFILE_ADDRESS: '0x1d36C2F3f0C9212422B94608cAA72080CBf34A41',
  
  // Token contracts
  SOULSHARD_ADDRESS: '0x97B2C2a9A11C7b6A020b4bAEaAd349865eaD0bcF', // Keep same if not changed
  TESTUSD_ADDRESS: '0xa095B8c9D9964F62A7dbA3f60AA91dB381A3e074', // Keep same if not changed
  
  // Infrastructure contracts
  ORACLE_ADDRESS: '0x54Ff2524C996d7608CaE9F3D9dd2075A023472E9',
  DUNGEONCORE_ADDRESS: '0x4D353aFC420E6187bfA5F99f0DdD8F7F137c20E9',
  PLAYERVAULT_ADDRESS: '0xF68cEa7E171A5caF151A85D7BEb2E862B83Ccf78',
  DUNGEONSTORAGE_ADDRESS: '0x6B85882ab32471Ce4a6599A7256E50B8Fb1fD43e',
  ALTAROFASCENSION_ADDRESS: '0xb53c51Dc426c2Bd29da78Ac99426c55A6D6a51Ab',
  
  // Wallet address (keep same if not changed)
  DUNGEONMASTERWALLET_ADDRESS: '0x10925A7138649C7E1794CE646182eeb5BF8ba647'
};

console.log('🚀 Updating metadata server to V19 contract addresses...\n');

// Step 1: Backup current .env file
const envPath = path.join(__dirname, '.env');
const backupPath = path.join(__dirname, `.env.backup-${Date.now()}`);

if (fs.existsSync(envPath)) {
  fs.copyFileSync(envPath, backupPath);
  console.log(`✅ Backed up .env to ${backupPath}`);
} else {
  console.log('❌ No .env file found');
  process.exit(1);
}

// Step 2: Update .env file
try {
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  console.log('\n📝 Updating contract addresses in .env:\n');
  
  // Update each contract address
  Object.entries(V19_CONTRACTS).forEach(([key, value]) => {
    const regex = new RegExp(`^${key}=.*$`, 'gm');
    const newLine = `${key}=${value}`;
    
    if (envContent.match(regex)) {
      const oldValue = envContent.match(regex)[0].split('=')[1];
      if (oldValue !== value) {
        envContent = envContent.replace(regex, newLine);
        console.log(`   ✅ ${key}: ${oldValue} → ${value}`);
      } else {
        console.log(`   ⏭️  ${key}: Already up to date`);
      }
    } else {
      // Add if not exists
      envContent += `\n${newLine}`;
      console.log(`   ➕ ${key}: ${value} (added)`);
    }
  });
  
  // Update version info
  envContent = envContent.replace(/VERSION=V\d+/g, 'VERSION=V19');
  envContent = envContent.replace(/DEPLOYMENT_DATE=\d{4}-\d{2}-\d{2}/g, `DEPLOYMENT_DATE=${new Date().toISOString().split('T')[0]}`);
  
  // Update CONFIG_URL to v19 (if exists)
  envContent = envContent.replace(/CONFIG_URL=.*v\d+\.json/g, 'CONFIG_URL=https://dungeondelvers.xyz/config/v19.json');
  
  fs.writeFileSync(envPath, envContent);
  console.log('\n✅ .env file updated successfully!');
  
} catch (error) {
  console.error('\n❌ Error updating .env:', error.message);
  console.log('💾 Restoring from backup...');
  fs.copyFileSync(backupPath, envPath);
  console.log('✅ Restored original .env');
  process.exit(1);
}

// Step 3: Update configLoader.js if needed
const configLoaderPath = path.join(__dirname, 'src/configLoader.js');
if (fs.existsSync(configLoaderPath)) {
  let configContent = fs.readFileSync(configLoaderPath, 'utf8');
  
  // Update default config URL from v18 to v19
  if (configContent.includes('v18.json')) {
    configContent = configContent.replace(/v18\.json/g, 'v19.json');
    fs.writeFileSync(configLoaderPath, configContent);
    console.log('\n✅ Updated configLoader.js to use v19.json');
  }
}

// Step 4: Display next steps
console.log('\n🎉 V19 update completed!\n');
console.log('📋 Next steps:');
console.log('=====================================');
console.log('1. Review the changes:');
console.log('   cat .env | grep _ADDRESS');
console.log('');
console.log('2. Test locally:');
console.log('   npm start');
console.log('   curl http://localhost:3000/api/hero/1');
console.log('');
console.log('3. Commit and push:');
console.log('   git add .');
console.log('   git commit -m "Update to V19 contract addresses"');
console.log('   git push');
console.log('');
console.log('4. Deploy to Render:');
console.log('   - Render will auto-deploy from GitHub');
console.log('   - Or manually trigger deployment in Render dashboard');
console.log('');
console.log('5. Verify deployment:');
console.log('   curl https://dungeon-delvers-metadata-server.onrender.com/api/contracts');
console.log('');
console.log('⚠️  IMPORTANT NOTES:');
console.log('   - The backend will use these addresses as fallback');
console.log('   - Primary config still comes from CDN (v19.json)');
console.log('   - Make sure frontend deploys v19.json config file');
console.log(`   - Backup saved at: ${backupPath}`);
console.log('=====================================');