const fs = require('fs');
const path = require('path');

// 稀有度對應表
const rarityMap = {
  'Common': 1,
  'Uncommon': 2,
  'Rare': 3,
  'Epic': 4,
  'Legendary': 5
};

// 處理單個 JSON 文件
function fixRarityInJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(content);
    
    // 找到並修正 Rarity 屬性
    if (json.attributes) {
      json.attributes = json.attributes.map(attr => {
        if (attr.trait_type === 'Rarity' && typeof attr.value === 'string') {
          const numericValue = rarityMap[attr.value] || 1;
          return {
            ...attr,
            value: numericValue,
            display_type: 'number',
            max_value: 5
          };
        }
        return attr;
      });
    }
    
    // 寫回文件
    fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
    console.log(`✅ Fixed rarity in: ${filePath}`);
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

// 處理所有英雄和聖物 JSON
const heroFiles = [1, 2, 3, 4, 5].map(i => `api/hero/${i}.json`);
const relicFiles = [1, 2, 3, 4, 5].map(i => `api/relic/${i}.json`);

[...heroFiles, ...relicFiles].forEach(file => {
  fixRarityInJson(path.join(__dirname, file));
});

console.log('✅ All rarity values converted to numbers!');