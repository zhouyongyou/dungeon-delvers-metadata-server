# 使用官方 Node.js 18 Alpine 映像
FROM node:18-alpine

# 設定工作目錄
WORKDIR /app

# 複製 package.json 和 package-lock.json
COPY package*.json ./

# 安裝生產依賴
RUN npm ci --only=production && npm cache clean --force

# 複製源代碼
COPY src ./src

# 創建非 root 用戶
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# 更改文件擁有者
RUN chown -R nodejs:nodejs /app
USER nodejs

# 暴露端口
EXPOSE 3001

# 健康檢查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# 啟動命令
CMD ["node", "src/index.js"]