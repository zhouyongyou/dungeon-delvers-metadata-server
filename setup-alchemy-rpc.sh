#!/bin/bash

# 安全配置 Alchemy RPC 節點腳本
# 這個腳本會幫助你安全地配置 Alchemy RPC 節點

set -e

echo "🔐 DungeonDelvers - 安全配置 Alchemy RPC 節點"
echo "==============================================="

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 檢查 .env 文件
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env 文件不存在，從 .env.example 創建...${NC}"
    cp .env.example .env
fi

echo -e "${BLUE}📋 請提供你的 Alchemy API 信息：${NC}"
echo ""

# 獲取用戶輸入
read -p "請輸入你的 Alchemy API Key: " ALCHEMY_API_KEY

if [ -z "$ALCHEMY_API_KEY" ]; then
    echo -e "${RED}❌ API Key 不能為空！${NC}"
    exit 1
fi

# 構建 RPC URL
ALCHEMY_RPC_URL="https://bnb-mainnet.g.alchemy.com/v2/$ALCHEMY_API_KEY"

# 更新 .env 文件
echo -e "${BLUE}📝 更新 .env 文件...${NC}"

# 檢查是否已經有 BSC_MAINNET_RPC_URL 配置
if grep -q "^BSC_MAINNET_RPC_URL=" .env; then
    # 更新現有配置
    sed -i.bak "s|^BSC_MAINNET_RPC_URL=.*|BSC_MAINNET_RPC_URL=\"$ALCHEMY_RPC_URL\"|" .env
    echo -e "${GREEN}✅ 已更新現有的 BSC_MAINNET_RPC_URL 配置${NC}"
else
    # 添加新配置
    echo "" >> .env
    echo "# Alchemy RPC 配置 (安全地存儲在後端)" >> .env
    echo "BSC_MAINNET_RPC_URL=\"$ALCHEMY_RPC_URL\"" >> .env
    echo -e "${GREEN}✅ 已添加新的 BSC_MAINNET_RPC_URL 配置${NC}"
fi

# 測試 RPC 連接
echo -e "${BLUE}🔍 測試 RPC 連接...${NC}"
if command -v curl &> /dev/null; then
    RESPONSE=$(curl -s -X POST "$ALCHEMY_RPC_URL" \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}')
    
    if echo "$RESPONSE" | grep -q '"result"'; then
        echo -e "${GREEN}✅ RPC 連接測試成功！${NC}"
        BLOCK_NUMBER=$(echo "$RESPONSE" | grep -o '"result":"[^"]*' | cut -d'"' -f4)
        BLOCK_DECIMAL=$((16#${BLOCK_NUMBER:2}))
        echo -e "${GREEN}   當前區塊號: $BLOCK_DECIMAL${NC}"
    else
        echo -e "${RED}❌ RPC 連接測試失敗！${NC}"
        echo -e "${RED}   響應: $RESPONSE${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  未找到 curl 命令，跳過連接測試${NC}"
fi

# 安全提醒
echo ""
echo -e "${YELLOW}🔒 安全提醒：${NC}"
echo -e "${YELLOW}   1. .env 文件包含敏感信息，請勿提交到版本控制${NC}"
echo -e "${YELLOW}   2. 定期更換 API Key 以保持安全${NC}"
echo -e "${YELLOW}   3. 監控 API 使用量，避免超出配額${NC}"
echo -e "${YELLOW}   4. 僅在後端服務器上使用此 RPC URL${NC}"

# 檢查 .gitignore
if [ -f ".gitignore" ]; then
    if ! grep -q "^\.env$" .gitignore; then
        echo ".env" >> .gitignore
        echo -e "${GREEN}✅ 已將 .env 添加到 .gitignore${NC}"
    fi
else
    echo ".env" > .gitignore
    echo -e "${GREEN}✅ 已創建 .gitignore 並添加 .env${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Alchemy RPC 配置完成！${NC}"
echo -e "${GREEN}   現在可以重新啟動後端服務器以使用新的 RPC 節點${NC}"
echo ""
echo -e "${BLUE}📖 下一步：${NC}"
echo -e "${BLUE}   1. 重新啟動後端服務器: npm start${NC}"
echo -e "${BLUE}   2. 檢查 RPC 狀態: curl http://localhost:3001/api/rpc/status${NC}"
echo -e "${BLUE}   3. 確保前端啟用代理: VITE_USE_RPC_PROXY=true${NC}"