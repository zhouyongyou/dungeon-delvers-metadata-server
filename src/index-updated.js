// 更新後端使用去中心化子圖
// 在 index.js 的第 171 行附近

// The Graph URL - 使用去中心化版本
let THE_GRAPH_API_URL = process.env.THE_GRAPH_API_URL || 'https://gateway.thegraph.com/api/f6c1aba78203cfdf0cc732eafe677bdd/subgraphs/id/Hmwr7XYgzVzsUb9dw95gSGJ1Vof6qYypuvCxynzinCjs';
global.THE_GRAPH_API_URL = THE_GRAPH_API_URL;
const SUBGRAPH_ID = process.env.SUBGRAPH_ID || 'dungeon-delvers';

// ===== 修改稀有度讀取邏輯 =====
// 將 getRarityFromMapping 改為返回 null 而不是隨機值

// 在 index.js 第 1044 行和 1049 行，替換 getRarityFromMapping 的調用
// 原本：
// rarity = getRarityFromMapping(type, tokenId);
// 改為：
// rarity = null; // 不使用假的隨機值

// 在 generateNFTMetadata 函數中，如果 rarity 為 null，不顯示稀有度
// 第 1090 行附近
if (rarity !== null) {
  attributes.push({ trait_type: 'Rarity', value: rarity });
} else {
  // 不添加稀有度屬性，或添加一個佔位符
  attributes.push({ trait_type: 'Rarity', value: 'Unknown' });
}

// 修改圖片路徑，使用占位圖
const imageIndex = rarity || 'unknown'; // 如果沒有稀有度，使用 unknown
const imagePath = `${FRONTEND_DOMAIN}/images/${type}/${type}-${imageIndex}.png`;

// 或者使用通用占位圖
const imagePath = rarity 
  ? `${FRONTEND_DOMAIN}/images/${type}/${type}-${rarity}.png`
  : `${FRONTEND_DOMAIN}/images/placeholder.png`;