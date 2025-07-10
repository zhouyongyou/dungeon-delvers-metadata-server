// frontend-examples/hooks/useMetadata.js
// 自定義Hook：用於獲取NFT元數據

import { useState, useEffect, useCallback } from 'react';
import { API_URLS, HTTP_STATUS, ERROR_MESSAGES } from '../constants/api.js';

/**
 * 自定義Hook：獲取NFT元數據
 * @param {string} type - NFT類型 ('hero', 'relic', 'party', 'profile', 'vip')
 * @param {string|number} tokenId - Token ID
 * @param {Object} options - 配置選項
 */
export const useMetadata = (type, tokenId, options = {}) => {
  const { 
    enabled = true, 
    refetchInterval = 0,
    cacheTime = 5 * 60 * 1000, // 5分鐘
  } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 清除錯誤
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // 獲取元數據的函數
  const fetchMetadata = useCallback(async () => {
    if (!enabled || !tokenId || !type) return;

    try {
      setLoading(true);
      setError(null);

      // 獲取對應的API URL
      const getApiUrl = () => {
        switch (type) {
          case 'hero':
            return API_URLS.hero(tokenId);
          case 'relic':
            return API_URLS.relic(tokenId);
          case 'party':
            return API_URLS.party(tokenId);
          case 'profile':
            // ✅ 修改後：使用新的統一API端點
            return API_URLS.profile(tokenId);
          case 'vip':
            // ✅ 修改後：使用新的統一API端點
            return API_URLS.vip(tokenId);
          default:
            throw new Error(`Unsupported NFT type: ${type}`);
        }
      };

      const url = getApiUrl();
      
      // ❌ 舊版本的API調用（會產生錯誤）
      // if (type === 'profile') {
      //   url = `https://api.dungeondelvers.xyz/api/playerprofile/${tokenId}`;
      // }
      // if (type === 'vip') {
      //   url = `https://api.dungeondelvers.xyz/api/vipstaking/${tokenId}`;
      // }

      const response = await fetch(url);

      if (!response.ok) {
        switch (response.status) {
          case HTTP_STATUS.NOT_FOUND:
            throw new Error(`${type.toUpperCase()} #${tokenId} not found`);
          case HTTP_STATUS.INTERNAL_SERVER_ERROR:
            throw new Error(ERROR_MESSAGES.SERVER_ERROR);
          default:
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      }

      const metadata = await response.json();
      setData(metadata);
      
    } catch (err) {
      console.error(`Error fetching ${type} metadata:`, err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [type, tokenId, enabled]);

  // 重新獲取數據
  const refetch = useCallback(() => {
    return fetchMetadata();
  }, [fetchMetadata]);

  // 初始化和依賴更新時獲取數據
  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  // 自動重新獲取
  useEffect(() => {
    if (refetchInterval > 0 && enabled) {
      const interval = setInterval(fetchMetadata, refetchInterval);
      return () => clearInterval(interval);
    }
  }, [fetchMetadata, refetchInterval, enabled]);

  return {
    data,
    loading,
    error,
    refetch,
    clearError,
  };
};

/**
 * 批量獲取多個NFT元數據的Hook
 * @param {Array} requests - 請求陣列 [{ type, tokenId }, ...]
 */
export const useBatchMetadata = (requests) => {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const fetchBatchMetadata = useCallback(async () => {
    if (!requests || requests.length === 0) return;

    setLoading(true);
    const newData = {};
    const newErrors = {};

    const promises = requests.map(async ({ type, tokenId }) => {
      try {
        const url = API_URLS[type]?.(tokenId);
        if (!url) {
          throw new Error(`Unsupported NFT type: ${type}`);
        }

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const metadata = await response.json();
        const key = `${type}-${tokenId}`;
        newData[key] = metadata;
      } catch (err) {
        const key = `${type}-${tokenId}`;
        newErrors[key] = err.message;
      }
    });

    await Promise.allSettled(promises);

    setData(newData);
    setErrors(newErrors);
    setLoading(false);
  }, [requests]);

  useEffect(() => {
    fetchBatchMetadata();
  }, [fetchBatchMetadata]);

  return {
    data,
    loading,
    errors,
    refetch: fetchBatchMetadata,
  };
};

/**
 * 專門用於VIP元數據的Hook
 * ✅ 已更新為使用新的API端點
 */
export const useVipMetadata = (tokenId, options = {}) => {
  return useMetadata('vip', tokenId, options);
};

/**
 * 專門用於Profile元數據的Hook
 * ✅ 已更新為使用新的API端點
 */
export const useProfileMetadata = (tokenId, options = {}) => {
  return useMetadata('profile', tokenId, options);
};

export default useMetadata;