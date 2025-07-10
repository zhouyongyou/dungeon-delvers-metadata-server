// frontend-examples/constants/api.js
// API端點常數配置

// API基礎配置
export const API_CONFIG = {
  // 生產環境API基礎URL
  BASE_URL: process.env.VITE_API_BASE_URL || 'https://api.dungeondelvers.xyz',
  
  // 開發環境API基礎URL
  DEV_BASE_URL: 'http://localhost:3001',
  
  // 請求超時時間（毫秒）
  TIMEOUT: 30000,
  
  // 重試次數
  RETRY_ATTEMPTS: 3,
};

// NFT類型枚舉
export const NFT_TYPES = {
  HERO: 'hero',
  RELIC: 'relic',
  PARTY: 'party',
  PROFILE: 'profile',
  VIP: 'vip',
};

// ✅ 統一後的API端點
export const API_ENDPOINTS = {
  // NFT元數據端點
  HERO: '/api/hero',
  RELIC: '/api/relic',
  PARTY: '/api/party',
  PROFILE: '/api/profile',        // ✅ 修改後：統一使用 /api/profile
  VIP: '/api/vip',                // ✅ 修改後：統一使用 /api/vip
  
  // 系統端點
  HEALTH: '/health',
};

// ❌ 舊版本的API端點（已棄用，需要修改）
export const LEGACY_API_ENDPOINTS = {
  // 這些端點已經不可用，會產生404錯誤
  OLD_PROFILE: '/api/playerprofile',    // ❌ 已棄用
  OLD_VIP: '/api/vipstaking',           // ❌ 已棄用
};

// API端點生成器
export const createApiUrl = (endpoint, tokenId) => {
  const baseUrl = API_CONFIG.BASE_URL;
  return `${baseUrl}${endpoint}/${tokenId}`;
};

// 具體的API URL生成函數
export const API_URLS = {
  hero: (tokenId) => createApiUrl(API_ENDPOINTS.HERO, tokenId),
  relic: (tokenId) => createApiUrl(API_ENDPOINTS.RELIC, tokenId),
  party: (tokenId) => createApiUrl(API_ENDPOINTS.PARTY, tokenId),
  profile: (tokenId) => createApiUrl(API_ENDPOINTS.PROFILE, tokenId),  // ✅ 修改後
  vip: (tokenId) => createApiUrl(API_ENDPOINTS.VIP, tokenId),          // ✅ 修改後
  health: () => `${API_CONFIG.BASE_URL}${API_ENDPOINTS.HEALTH}`,
};

// HTTP狀態碼
export const HTTP_STATUS = {
  OK: 200,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
};

// 錯誤消息
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  NOT_FOUND: 'Resource not found.',
  SERVER_ERROR: 'Internal server error. Please try again later.',
  TIMEOUT: 'Request timeout. Please try again.',
  INVALID_TOKEN_ID: 'Invalid token ID provided.',
};

// 快取配置
export const CACHE_CONFIG = {
  // 快取時間（毫秒）
  TTL: 5 * 60 * 1000, // 5分鐘
  
  // 快取鍵前綴
  KEY_PREFIX: 'dd_metadata_',
  
  // 啟用快取
  ENABLED: true,
};

export default {
  API_CONFIG,
  NFT_TYPES,
  API_ENDPOINTS,
  LEGACY_API_ENDPOINTS,
  API_URLS,
  HTTP_STATUS,
  ERROR_MESSAGES,
  CACHE_CONFIG,
};