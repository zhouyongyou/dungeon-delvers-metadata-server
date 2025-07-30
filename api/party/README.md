# Party NFT Metadata

Party NFT 的 metadata 是動態生成的，基於總戰力（Total Power）來決定：

## 圖片規則
- 總戰力 300-599: 使用 300-599.png
- 總戰力 600-899: 使用 600-899.png
- 總戰力 900-1199: 使用 900-1199.png
- ... 以此類推

## 戰力等級
- < 300: Novice
- 300-599: Apprentice
- 600-899: Journeyman
- 900-1199: Expert
- 1200-1499: Master
- 1500-1799: Grandmaster
- 1800-2099: Champion
- 2100-2399: Hero
- 2400-2699: Legend
- 2700-2999: Mythic
- 3000-3299: Divine
- 3300-3599: Eternal
- 3600-3899: Transcendent
- ≥ 3900: Godlike

## 注意事項
- 不需要為每個戰力範圍創建單獨的 JSON 文件
- 圖片根據 totalPower 動態選擇
- 所有圖片存放在前端的 `/public/images/party/300-4199/` 目錄