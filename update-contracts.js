// 更新合約地址的腳本

const fs = require('fs');
const path = require('path');

// 正確的合約地址（來自用戶提供的資訊）
const CORRECT_CONTRACTS = {
  hero: '0x2a046140668cBb8F598ff3852B08852A8EB23b6a',
  relic: '0x95F005e2e0d38381576DA36c5CA4619a87da550E',
  party: '0x11FB68409222B53b04626d382d7e691e640A1DcD',
  vip: '0xefdfF583944A2c6318d1597AD1E41159fCd8F6dB', // 注意：這是 VIPStaking
  playerprofile: '0x43a9BE911f1074788A00cE8e6E00732c7364c1F4'
};

// 讀取 index.js
const indexPath = path.join(__dirname, 'src/index.js');
let content = fs.readFileSync(indexPath, 'utf8');

// 找到 CONTRACTS 定義的位置
const contractsRegex = /const CONTRACTS = \{[\s\S]*?\};/;
const newContracts = `const CONTRACTS = {
  hero: '${CORRECT_CONTRACTS.hero}',
  relic: '${CORRECT_CONTRACTS.relic}',
  party: '${CORRECT_CONTRACTS.party}',
  vip: '${CORRECT_CONTRACTS.vip}',
  playerprofile: '${CORRECT_CONTRACTS.playerprofile}'
};`;

// 替換合約地址
content = content.replace(contractsRegex, newContracts);

// 寫回文件
fs.writeFileSync(indexPath, content);

console.log('✅ 合約地址已更新！');
console.log('新的合約地址：');
console.log(CORRECT_CONTRACTS);