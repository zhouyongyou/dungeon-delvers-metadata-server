// utils.js (The Graph 終極優化版)
// 說明: 此版本全面改用 The Graph 作為主要數據來源，以實現最高的穩定性和效能。

import { createPublicClient, http, formatEther } from 'viem';
import { bsc } from 'viem/chains';
import NodeCache from 'node-cache';
import { GraphQLClient, gql } from 'graphql-request'; // ★ 新增：導入 GraphQL 工具
import {
  heroABI,
  relicABI,
  partyABI,
  playerProfileABI,
  vipStakingABI,
  oracleABI,
} from './abis.js';

// =======================================================
// Section 1: 客戶端與合約設定
// =======================================================

// Viem client 仍然需要，用於呼叫 Oracle 等少數即時數據
export const publicClient = createPublicClient({
  chain: bsc,
  transport: http(process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org/'),
});

// ★ 新增：The Graph 客戶端 (帶重試機制)
const THE_GRAPH_API_URL = process.env.VITE_THE_GRAPH_STUDIO_API_URL;
const baseGraphClient = new GraphQLClient(THE_GRAPH_API_URL);

// 帶重試機制的 GraphQL 客戶端
export const graphClient = {
  async request(query, variables, maxRetries = 3) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await baseGraphClient.request(query, variables);
        if (i > 0) {
          logger.info('GraphQL request succeeded after retry', { 
            attempt: i + 1, 
            variables 
          });
        }
        return result;
      } catch (error) {
        lastError = error;
        logger.error(`GraphQL request failed (attempt ${i + 1}/${maxRetries})`, error, { 
          query: query.definitions?.[0]?.name?.value || 'unknown',
          variables 
        });
        
        if (i < maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, i), 5000); // 指數退避，最大5秒
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }
};

export const contractAddresses = {
    hero: process.env.VITE_MAINNET_HERO_ADDRESS,
    relic: process.env.VITE_MAINNET_RELIC_ADDRESS,
    party: process.env.VITE_MAINNET_PARTY_ADDRESS,
    playerProfile: process.env.VITE_MAINNET_PLAYERPROFILE_ADDRESS,
    vipStaking: process.env.VITE_MAINNET_VIPSTAKING_ADDRESS,
    oracle: process.env.VITE_MAINNET_ORACLE_ADDRESS,
    soulShard: process.env.VITE_MAINNET_SOUL_SHARD_TOKEN_ADDRESS,
};

export const abis = {
    hero: heroABI,
    relic: relicABI,
    party: partyABI,
    playerProfile: playerProfileABI,
    vipStaking: vipStakingABI,
    oracle: oracleABI,
};

// =======================================================
// Section 2: 分層快取設定 (優化版)
// =======================================================
const cacheConfigs = {
  hero: { ttl: 3600, checkperiod: 600 },      // 1小時 - 相對靜態
  relic: { ttl: 3600, checkperiod: 600 },     // 1小時 - 相對靜態
  party: { ttl: 1800, checkperiod: 300 },     // 30分鐘 - 中等動態
  profile: { ttl: 300, checkperiod: 60 },     // 5分鐘 - 高動態
  vip: { ttl: 600, checkperiod: 120 }         // 10分鐘 - 中等動態
};

const caches = {};
Object.keys(cacheConfigs).forEach(type => {
  caches[type] = new NodeCache(cacheConfigs[type]);
});

// 結構化日誌工具
const logger = {
  info: (message, meta = {}) => {
    console.log(JSON.stringify({
      level: 'info',
      message,
      meta,
      timestamp: new Date().toISOString()
    }));
  },
  error: (message, error, meta = {}) => {
    console.error(JSON.stringify({
      level: 'error',
      message,
      error: error?.message || error,
      stack: error?.stack,
      meta,
      timestamp: new Date().toISOString()
    }));
  }
};

// 導出 logger 供其他模組使用
export { logger };

// 降級策略 - 當 GraphQL 失敗時返回基本元數據
export const fallbackMetadata = (tokenId, type) => {
  const typeConfig = {
    hero: { name: 'Hero', description: 'A brave hero from the world of Dungeon Delvers.', emoji: '⚔️' },
    relic: { name: 'Relic', description: 'An ancient relic imbued with mysterious powers.', emoji: '💎' },
    party: { name: 'Party', description: 'A brave party of delvers, united for a common goal.', emoji: '🛡️' },
    profile: { name: 'Profile', description: 'A soul-bound achievement token for Dungeon Delvers.', emoji: '👤' },
    vip: { name: 'VIP', description: 'A soul-bound VIP card that provides in-game bonuses.', emoji: '👑' }
  };
  
  const config = typeConfig[type] || typeConfig.hero;
  const fallbackSVG = `<svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
    <rect width="400" height="400" fill="#1a1a1a"/>
    <text x="200" y="180" text-anchor="middle" font-family="Arial" font-size="64" fill="#666">${config.emoji}</text>
    <text x="200" y="250" text-anchor="middle" font-family="Arial" font-size="24" fill="#999">Loading...</text>
  </svg>`;
  
  return {
    name: `Dungeon Delvers ${config.name} #${tokenId}`,
    description: config.description,
    image: `data:image/svg+xml;base64,${Buffer.from(fallbackSVG).toString('base64')}`,
    attributes: [
      { trait_type: "Status", value: "Temporarily Unavailable" }
    ]
  };
};

export const withCache = async (key, generator, type = 'hero') => {
  const cache = caches[type] || caches.hero;
  const cachedData = cache.get(key);
  
  if (cachedData) {
    logger.info('Cache hit', { key, type });
    return cachedData;
  }
  
  logger.info('Cache miss - generating new data', { key, type });
  const startTime = Date.now();
  
  try {
    const newData = await generator();
    cache.set(key, newData);
    
    logger.info('Data generated successfully', { 
      key, 
      type, 
      duration: Date.now() - startTime 
    });
    
    return newData;
  } catch (error) {
    logger.error('Failed to generate data', error, { key, type });
    throw error;
  }
};

// =======================================================
// Section 3: SVG 生成邏輯 (保持不變)
// =======================================================
// (此處省略所有 SVG 生成函式，它們與之前版本相同，無需修改)

const _getSVGHeader = () => `<svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">`;
const _getGlobalStyles = () => `<style>.base{font-family: 'Georgia', serif; fill: #e0e0e0;}.title{font-size: 20px; font-weight: bold;}.subtitle{font-size: 14px; opacity: 0.7;}.stat-label{font-size: 12px; font-weight: bold; text-transform: uppercase; opacity: 0.6;}.stat-value{font-size: 16px; font-weight: bold;}.main-stat-value{font-size: 42px; font-weight: bold;}.footer-text{font-size: 12px; opacity: 0.5;}</style>`;
const _getGradientDefs = (c1, c2) => `<defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>`;
const _getBackgroundPattern = (color) => `<rect width="400" height="400" fill="#111"/><g opacity="0.1"><path d="M10 0 L0 10 M20 0 L0 20 M30 0 L0 30" stroke="${color}" stroke-width="1"/><path d="M-10 400 L410 400" stroke="${color}" stroke-width="2"/></g>`;
const _getBorder = (rarity) => `<rect x="4" y="4" width="392" height="392" rx="15" fill="transparent" stroke="${_getRarityColor(rarity)}" stroke-width="2" stroke-opacity="0.8"/>`;
const _getHeader = (title, subtitle, tokenId) => `<text x="20" y="38" class="base title">${title}<tspan class="subtitle">${subtitle}</tspan></text><text x="380" y="38" class="base subtitle" text-anchor="end">#${tokenId}</text>`;
const _getCentralImage = (emoji) => `<rect x="50" y="65" width="300" height="150" rx="10" fill="rgba(0,0,0,0.2)"/><text x="50%" y="140" font-size="90" text-anchor="middle" dominant-baseline="middle">${emoji}</text>`;
const _getPrimaryStat = (label, value) => `<text x="50%" y="245" class="base stat-label" text-anchor="middle">${label}</text><text x="50%" y="280" class="base main-stat-value" text-anchor="middle" fill="url(#grad)">${value}</text>`;
const _getSecondaryStats = (label1, value1, label2, value2) => `<line x1="20" y1="320" x2="380" y2="320" stroke="#444" stroke-width="1"/><g text-anchor="middle"><text x="120" y="345" class="base stat-label">${label1}</text><text x="120" y="365" class="base stat-value">${value1}</text><text x="280" y="345" class="base stat-label">${label2}</text><text x="280" y="365" class="base stat-value">${value2}</text></g>`;
const _getFooter = (text) => `<text x="50%" y="390" class="base footer-text" text-anchor="middle">${text}</text>`;
const _getRarityColor = (rarity) => {
    if (rarity == 5) return "#E040FB";
    if (rarity == 4) return "#00B0FF";
    if (rarity == 3) return "#FFD600";
    if (rarity == 2) return "#CFD8DC";
    return "#D7CCC8";
};
const _getRarityStars = (rarity) => {
    let stars = '';
    const color = _getRarityColor(rarity);
    for (let i = 0; i < 5; i++) {
        stars += `<tspan fill="${color}" fill-opacity="${i < rarity ? '1' : '0.2'}">★</tspan>`;
    }
    return stars;
};

export function generateHeroSVG(data, tokenId) {
    const [primaryColor, accentColor] = ["#B71C1C", "#F44336"];
    return `${_getSVGHeader()}
        ${_getGlobalStyles()}
        ${_getGradientDefs(primaryColor, accentColor)}
        ${_getBackgroundPattern(primaryColor)}
        ${_getBorder(data.rarity)}
        ${_getHeader("Hero", "", tokenId)}
        ${_getCentralImage("⚔️")}
        ${_getPrimaryStat("POWER", data.power.toString())}
        ${_getSecondaryStats("RARITY", _getRarityStars(data.rarity), "", "")}
        ${_getFooter("Dungeon Delvers")}
    </svg>`;
}

export function generateRelicSVG(data, tokenId) {
    const [primaryColor, accentColor] = ["#1A237E", "#3F51B5"];
    return `${_getSVGHeader()}
        ${_getGlobalStyles()}
        ${_getGradientDefs(primaryColor, accentColor)}
        ${_getBackgroundPattern(primaryColor)}
        ${_getBorder(data.rarity)}
        ${_getHeader("Relic", "", tokenId)}
        ${_getCentralImage("💎")}
        ${_getPrimaryStat("CAPACITY", data.capacity.toString())}
        ${_getSecondaryStats("RARITY", _getRarityStars(data.rarity), "", "")}
        ${_getFooter("Ancient Artifact")}
    </svg>`;
}

const _getPartyStyles = (rarity) => {
    if (rarity == 5) return ["#4A148C", "#E1BEE7", "Diamond Tier"];
    if (rarity == 4) return ["#0D47A1", "#BBDEFB", "Platinum Tier"];
    if (rarity == 3) return ["#FF6F00", "#FFECB3", "Gold Tier"];
    if (rarity == 2) return ["#BDBDBD", "#FAFAFA", "Silver Tier"];
    return ["#BF360C", "#FFCCBC", "Bronze Tier"];
};
export function generatePartySVG(data, tokenId) {
    const [primaryColor, accentColor, rarityTierName] = _getPartyStyles(data.partyRarity);
    return `${_getSVGHeader()}
        ${_getGlobalStyles()}
        ${_getGradientDefs(primaryColor, accentColor)}
        ${_getBackgroundPattern(primaryColor)}
        ${_getBorder(data.partyRarity)}
        ${_getHeader("Delvers", " PARTY", tokenId)}
        ${_getCentralImage("🛡️")}
        ${_getPrimaryStat("TOTAL POWER", data.totalPower.toString())}
        ${_getSecondaryStats(rarityTierName, `${data.heroIds.length} / ${data.totalCapacity} SLOTS`, "", "")}
        ${_getFooter("United We Stand")}
    </svg>`;
}

export function generateProfileSVG(data, tokenId) {
    const { level, experience } = data;
    const getExpForNextLevel = (lvl) => (lvl > 0 ? BigInt(lvl) * BigInt(lvl) * 100n : 0n);
    const expForNextLevel = getExpForNextLevel(level);
    const expForCurrentLevel = getExpForNextLevel(level - 1);
    let progress = 0;
    if (expForNextLevel > expForCurrentLevel) {
       progress = Number((experience - expForCurrentLevel) * 100n / (expForNextLevel - expForCurrentLevel));
    }
    const getTierColors = (_level) => {
        if (_level >= 30) return ["#4A3F6D", "#A78BFA", "#7C3AED"];
        if (_level >= 20) return ["#4D4223", "#FBBF24", "#F59E0B"];
        if (_level >= 10) return ["#4B5563", "#9CA3AF", "#E5E7EB"];
        return ["#422C1A", "#D97706", "#F59E0B"];
    };
    const [bgColor, highlightColor, gradientStop2] = getTierColors(level);
    const _generateSVGDefs = (highlight, stop2) => `<defs><style>.text{font-family:Georgia,serif;fill:#F3EFE0;text-shadow:0 0 5px rgba(0,0,0,0.5);}.header{font-size:24px;font-weight:bold;}.level-text{font-size:56px;font-weight:bold;}.exp-text{font-size:14px;fill-opacity:0.9;}</style><linearGradient id="border-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${highlight}"/><stop offset="100%" stop-color="${stop2}"/><animateTransform attributeName="gradientTransform" type="rotate" from="0 200 200" to="360 200 200" dur="5s" repeatCount="indefinite"/></linearGradient><linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${stop2}"/><stop offset="100%" stop-color="${highlight}"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="3.5" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
    const _generateStars = () => `<g opacity="0.7"><circle cx="50" cy="50" r="1" fill="white" fill-opacity="0.5"><animate attributeName="fill-opacity" values="0.5;1;0.5" dur="4s" repeatCount="indefinite" begin="-2s"/></circle><circle cx="300" cy="80" r="0.8" fill="white" fill-opacity="0.8"><animate attributeName="fill-opacity" values="0.8;0.3;0.8" dur="3s" repeatCount="indefinite"/></circle><circle cx="150" cy="320" r="1.2" fill="white" fill-opacity="0.6"><animate attributeName="fill-opacity" values="0.6;1;0.6" dur="5s" repeatCount="indefinite" begin="-1s"/></circle></g>`;
    const _generateArcs = (_level, highlight) => {
        let maxArcs = Math.floor(_level / 5) + 1;
        if (maxArcs > 10) maxArcs = 10;
        let arcsHTML = "";
        for (let i = 0; i < maxArcs - 1; i++) {
            const radius = 60 + i * 10;
            arcsHTML += `<circle cx="200" cy="200" r="${radius}" fill="none" stroke="${highlight}" stroke-width="4" stroke-opacity="0.2"/>`;
        }
        return arcsHTML;
    };
    const _generateProgressArc = (_level, _progress) => {
        let maxArcs = Math.floor(_level / 5) + 1;
        if (maxArcs > 10) maxArcs = 10;
        const activeRadius = 60 + (maxArcs - 1) * 10;
        const circumference = 2 * Math.PI * activeRadius;
        const strokeDashoffset = circumference * (100 - _progress) / 100;
        return `<circle cx="200" cy="200" r="${activeRadius}" fill="none" stroke="white" stroke-width="5" stroke-opacity="0.3"/><circle cx="200" cy="200" r="${activeRadius}" fill="none" stroke="url(#progress-gradient)" stroke-width="5" stroke-dasharray="${circumference}" stroke-dashoffset="${strokeDashoffset}" transform="rotate(-90 200 200)"><animateTransform attributeName="transform" type="rotate" from="-90 200 200" to="270 200 200" dur="10s" repeatCount="indefinite"/></circle>`;
    };
    const _generateTextContent = (_tokenId, _level, currentExpInLevel, expNeededForNext, highlight) => `<g><text x="50%" y="45%" text-anchor="middle" dominant-baseline="middle" class="text level-text" fill="${highlight}">${_level}</text><text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" class="text" style="font-size:16px;opacity:0.8;">LEVEL</text><text x="50%" y="12%" text-anchor="middle" class="text header">PLAYER PROFILE #${_tokenId}</text><text x="50%" y="90%" text-anchor="middle" class="text exp-text">${currentExpInLevel.toString()} / ${expNeededForNext.toString()} EXP</text></g>`;

    return `<svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
        ${_generateSVGDefs(highlightColor, gradientStop2)}
        <rect width="100%" height="100%" rx="20" fill="${bgColor}"/>
        ${_generateStars()}
        <g filter="url(#glow)">
            ${_generateArcs(level, highlightColor)}
            ${_generateProgressArc(level, progress)}
        </g>
        ${_generateTextContent(tokenId, level, experience - expForCurrentLevel, expForNextLevel - expForCurrentLevel, highlightColor)}
        <rect x="2" y="2" width="396" height="396" rx="18" fill="none" stroke="url(#border-gradient)" stroke-width="4"/>
    </svg>`;
}

export function generateVipSVG(data, tokenId) {
    const { level, stakedValueUSD } = data;
    const getTierStyles = (_level) => {
        if (_level >= 13) return { highlightColor: "#a78bfa", tierName: "DIAMOND" };
        if (_level >= 10) return { highlightColor: "#E5E7EB", tierName: "PLATINUM" };
        if (_level >= 7)  return { highlightColor: "#fbbd23", tierName: "GOLD" };
        if (_level >= 4)  return { highlightColor: "#C0C0C0", tierName: "SILVER" };
        if (_level >= 1)  return { highlightColor: "#cd7f32", tierName: "BRONZE" };
        return { highlightColor: "#6B7280", tierName: "STANDARD" };
    };
    const { highlightColor, tierName } = getTierStyles(level);
    const getLevelRequirement = (lvl) => (lvl > 0 ? BigInt(lvl) * BigInt(lvl) * 100n * BigInt(1e18) : 0n);
    const currentTierRequirementUSD = getLevelRequirement(level);
    const nextTierRequirementUSD = getLevelRequirement(level + 1);
    let progress = 0;
    if (nextTierRequirementUSD > currentTierRequirementUSD) {
        const range = nextTierRequirementUSD - currentTierRequirementUSD;
        const currentInLevel = stakedValueUSD - currentTierRequirementUSD;
        if (range > 0) {
             progress = Number(currentInLevel * 100n / range);
        }
    }
    if (level > 0 && nextTierRequirementUSD <= currentTierRequirementUSD) { 
        progress = 100;
    }
    const progressWidth = progress * 330 / 100;
    let progressLabel = "MAX TIER REACHED";
    if (nextTierRequirementUSD > currentTierRequirementUSD) {
        progressLabel = `${formatEther(stakedValueUSD)} / ${formatEther(nextTierRequirementUSD)} USD`;
    }
    const _generateVIPDefs = (highlight) => `<defs><radialGradient id="bg-gradient" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#2d2d2d" /><stop offset="100%" stop-color="#111111" /></radialGradient><pattern id="grid-pattern" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#ffffff" stroke-width="0.2" opacity="0.05"/></pattern><style>@keyframes breathing-glow { 0% { text-shadow: 0 0 8px ${highlight}; } 50% { text-shadow: 0 0 16px ${highlight}, 0 0 24px ${highlight}; } 100% { text-shadow: 0 0 8px ${highlight}; } }.title-plat { font-family: Georgia, serif; font-size: 22px; fill: #ffd700; font-weight: bold; letter-spacing: 3px; text-transform: uppercase; }.level-plat { font-family: sans-serif; font-size: 96px; fill: ${highlight}; font-weight: bold; animation: breathing-glow 5s ease-in-out infinite; }.bonus-plat { font-family: sans-serif; font-size: 20px; fill: ${highlight}; opacity: 0.9; animation: breathing-glow 5s ease-in-out infinite; animation-delay: -0.2s;}.card-id-plat { font-family: "Lucida Console", monospace; font-size: 12px; fill: #ffffff; opacity: 0.6;}.progress-text { font-family: "Lucida Console", monospace; font-size: 11px; fill-opacity: 0.8; }</style></defs>`;
    const _generateVIPStars = () => `<g opacity="0.7"><circle cx="50" cy="100" r="1.5" fill="white" fill-opacity="0.1"><animate attributeName="opacity" values="0.1;0.3;0.1" dur="5s" repeatCount="indefinite" begin="0s"/></circle><circle cx="320" cy="80" r="0.8" fill="white" fill-opacity="0.2"><animate attributeName="opacity" values="0.2;0.5;0.2" dur="7s" repeatCount="indefinite" begin="-2s"/></circle><circle cx="150" cy="350" r="1.2" fill="white" fill-opacity="0.1"><animate attributeName="opacity" values="0.1;0.4;0.1" dur="6s" repeatCount="indefinite" begin="-1s"/></circle><circle cx="250" cy="280" r="1" fill="white" fill-opacity="0.3"><animate attributeName="opacity" values="0.3;0.1;0.3" dur="8s" repeatCount="indefinite" begin="-3s"/></circle></g>`;
    const _generateProgressBar = (color) => `<g transform="translate(35, 280)"><rect x="0" y="0" width="330" height="18" rx="9" fill="#374151"/><rect x="0" y="0" width="${progressWidth}" height="18" rx="9" fill="${color}"/><text x="165" y="35" text-anchor="middle" class="progress-text" fill="white">${progressLabel}</text><text x="165" y="50" text-anchor="middle" class="progress-text" fill="#9ca3af" style="font-size: 9px;">(Value of staked $SOUL)</text></g>`;
    const _generateVIPFooter = () => `<text x="35" y="370" class="card-id-plat">CARD #${tokenId}</text><text x="365" y="370" text-anchor="end" class="card-id-plat" font-weight="bold">Dungeon Delvers</text>`;
    const _generateVIPBorders = (color) => `<g stroke="${color}" stroke-width="1.5" opacity="0.3"><path d="M 30 20 L 20 20 L 20 30" fill="none" /><path d="M 370 20 L 380 20 L 380 30" fill="none" /><path d="M 30 380 L 20 380 L 20 370" fill="none" /><path d="M 370 380 L 380 380 L 380 370" fill="none" /></g>`;
    
    return `<svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
        ${_generateVIPDefs(highlightColor)}
        <rect width="100%" height="100%" rx="20" fill="url(#bg-gradient)"/>
        <rect width="100%" height="100%" rx="20" fill="url(#grid-pattern)"/>
        ${_generateVIPStars()}
        <text x="50%" y="60" text-anchor="middle" class="title-plat">${tierName} VIP PRIVILEGE</text>
        <g text-anchor="middle">
            <text x="50%" y="190" class="level-plat">${level > 0 ? level : "-"}</text>
            <text x="50%" y="235" class="bonus-plat">SUCCESS RATE +${level}%</text>
        </g>
        ${_generateProgressBar(highlightColor)}
        ${_generateVIPFooter()}
        ${_generateVIPBorders(highlightColor)}
    </svg>`;
}
