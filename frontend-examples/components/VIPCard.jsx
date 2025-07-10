// frontend-examples/components/VIPCard.jsx
// React組件示例：VIP卡片組件

import React, { useState, useEffect } from 'react';

const VIPCard = ({ tokenId, apiBaseUrl = 'https://api.dungeondelvers.xyz' }) => {
  const [vipData, setVipData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchVipData = async () => {
      try {
        setLoading(true);
        setError(null);

        // ✅ 修改後：使用新的統一路由
        const response = await fetch(`${apiBaseUrl}/api/vip/${tokenId}`);
        
        // ❌ 修改前：舊的API端點（會產生404錯誤）
        // const response = await fetch(`${apiBaseUrl}/api/vipstaking/${tokenId}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        setVipData(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (tokenId) {
      fetchVipData();
    }
  }, [tokenId, apiBaseUrl]);

  if (loading) {
    return (
      <div className="vip-card loading">
        <div className="spinner">Loading VIP #{tokenId}...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="vip-card error">
        <div className="error-message">
          Error loading VIP #{tokenId}: {error}
        </div>
      </div>
    );
  }

  if (!vipData) {
    return (
      <div className="vip-card no-data">
        <div className="no-data-message">
          No VIP data found for token #{tokenId}
        </div>
      </div>
    );
  }

  return (
    <div className="vip-card">
      <div className="vip-card-header">
        <h3>{vipData.name}</h3>
        <span className="token-id">#{tokenId}</span>
      </div>
      
      <div className="vip-card-image">
        <img 
          src={vipData.image} 
          alt={vipData.name}
          loading="lazy"
        />
      </div>
      
      <div className="vip-card-attributes">
        {vipData.attributes?.map((attr, index) => (
          <div key={index} className="attribute">
            <span className="trait-type">{attr.trait_type}:</span>
            <span className="value">{attr.value}</span>
          </div>
        ))}
      </div>
      
      <div className="vip-card-description">
        <p>{vipData.description}</p>
      </div>
    </div>
  );
};

export default VIPCard;