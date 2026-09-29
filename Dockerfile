# 在线德州扑克 — Node 部署镜像
FROM node:22-alpine

WORKDIR /app

# 先装依赖（利用层缓存）
COPY package*.json ./
RUN npm install --omit=dev

# 复制源码（public/ 为前端，服务端只需游戏逻辑 + server）
COPY . .

# 云平台会通过环境变量 PORT 注入端口；本地默认 3000
EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
