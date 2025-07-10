# Dungeon Delvers - 元數據伺服器

這是一個專門為 Dungeon Delvers 專案提供動態鏈上 SVG 元數據的後端伺服器。

## 專案目的

當 NFT 在 OpenSea、錢包或其他第三方平台顯示時，這些平台會呼叫 NFT 合約的 `tokenURI` 函式來獲取元數據。為了讓 NFT 的圖片能夠即時反映鏈上的最新狀態（例如玩家等級、VIP 等級等），我們需要一個能夠：
1.  接收 API 請求 (例如 `/api/profile/123`)。
2.  即時讀取區塊鏈上的數據。
3.  根據最新數據動態生成 SVG 圖像。
4.  將包含 SVG 的元數據 JSON 回傳。

這個伺服器正是為此而生。

## 技術棧

- **Node.js**: JavaScript 執行環境
- **Express**: 輕量級的 Web 框架，用於建立 API
- **Viem**: 高效能、型別安全的以太坊互動工具
- **dotenv**: 用於管理環境變數

## 安裝與啟動

1.  **安裝依賴**
    ```bash
    npm install
    ```

2.  **設定環境變數**
    複製 `.env.example` 檔案並重新命名為 `.env`。
    ```bash
    cp .env.example .env
    ```
    接著，打開 `.env` 檔案，填入您的 BSC 主網 RPC URL 以及所有已部署的合約地址。

3.  **啟動伺服器**
    -   **開發模式 (會監聽檔案變動並自動重啟):**
        ```bash
        npm run dev
        ```
    -   **生產模式:**
        ```bash
        npm start
        ```

伺服器預設會在 `http://localhost:3001` 啟動。

## API 端點

伺服器提供以下端點來獲取各類 NFT 的元數據：

-   `GET /api/hero/:tokenId` - 獲取英雄NFT元數據
-   `GET /api/relic/:tokenId` - 獲取聖物NFT元數據
-   `GET /api/party/:tokenId` - 獲取隊伍NFT元數據
-   `GET /api/profile/:tokenId` - 獲取玩家資料NFT元數據
-   `GET /api/vip/:tokenId` - 獲取VIP卡NFT元數據
-   `GET /health` - 伺服器健康檢查
