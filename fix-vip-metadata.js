// 修復 VIP 和 PlayerProfile metadata 的腳本

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'src/index.js');
let content = fs.readFileSync(indexPath, 'utf8');

// 找到 switch 語句的結尾
const switchEndPattern = /case 'party':[\s\S]*?\n    default:\n      return baseData;/;

// 新的 switch 語句包含 VIP 和 playerprofile
const newSwitchCases = `case 'party':
      return {
        ...baseData,
        name: \`隊伍 #\${tokenId}\`,
        image: \`\${FRONTEND_DOMAIN}/images/party/party.png\`,
        attributes: [
          { trait_type: 'Total Power', value: '載入中...' },
          { trait_type: 'Heroes Count', value: '載入中...' },
          { trait_type: 'Rarity', value: rarity || '載入中...' }
        ]
      };
    case 'vip':
    case 'vipstaking':
      return {
        ...baseData,
        name: \`VIP Pass #\${tokenId}\`,
        description: 'Exclusive VIP membership card for DungeonDelvers. Grants special privileges and reduced fees.',
        image: \`\${FRONTEND_DOMAIN}/images/vip/vip.png\`,
        attributes: [
          { trait_type: 'Type', value: 'VIP Pass' },
          { trait_type: 'Status', value: 'Active' },
          { trait_type: 'Benefits', value: 'Fee Reduction' }
        ]
      };
    case 'playerprofile':
      return {
        ...baseData,
        name: \`Player Profile #\${tokenId}\`,
        description: 'DungeonDelvers Player Profile NFT',
        image: \`\${FRONTEND_DOMAIN}/images/profile/profile.png\`,
        attributes: [
          { trait_type: 'Type', value: 'Player Profile' },
          { trait_type: 'Status', value: 'Active' }
        ]
      };
    default:
      return baseData;`;

// 替換 switch 語句
content = content.replace(switchEndPattern, newSwitchCases);

// 同時更新 getImageByRarity 函數以處理占位圖
const getImageByRarityPattern = /const getImageByRarity = \(type, rarity\) => \{[\s\S]*?\};/;
const newGetImageByRarity = `const getImageByRarity = (type, rarity) => {
    // 處理未知稀有度的情況
    if (!rarity || rarity === 0) {
      return \`\${FRONTEND_DOMAIN}/images/\${type}/\${type}-placeholder.png\`;
    }
    const rarityIndex = Math.max(1, Math.min(5, rarity));
    return \`\${FRONTEND_DOMAIN}/images/\${type}/\${type}-\${rarityIndex}.png\`;
  };`;

content = content.replace(getImageByRarityPattern, newGetImageByRarity);

// 寫回文件
fs.writeFileSync(indexPath, content);

console.log('✅ VIP 和 PlayerProfile metadata 處理已修復！');
console.log('✅ 占位圖片處理已添加！');