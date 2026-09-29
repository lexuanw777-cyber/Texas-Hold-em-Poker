# 部署指南（在线多人德州扑克）

本项目是 **Node.js + Express + Socket.IO** 实时多人游戏，需要后端常驻运行。
CloudStudio 的「静态站点部署」不支持后端，因此请部署到支持 Node 的平台
（Render / Railway / Fly.io / 任意 VPS）。以下以 **Render** 与 **Railway** 为例。

## 前置
- 一个 GitHub 账号，且本项目已推送到一个 GitHub 仓库。
- 本地已完成：`package.json` / `package-lock.json` 已就绪，依赖 express、socket.io。

## 方式一：Render（最简单，有免费额度）
1. 打开 https://render.com ，用 GitHub 登录。
2. New → Web Service → 选择本仓库。
3. 配置：
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - 实例类型：Free（或按需）
4. 在 Environment 里**无需**手动设 PORT —— Render 会自动注入 `PORT`，
   服务端已用 `process.env.PORT || 3000` 读取。
5. 点击 Create Web Service，等待构建完成。
6. 部署成功后，Render 会给出一个形如 `https://你的服务.onrender.com` 的链接，
   把它发给朋友即可同桌。

> 免费实例在空闲后会「休眠」，首个加入者可能需等待十几秒唤醒。

## 方式二：Railway
1. 打开 https://railway.app ，用 GitHub 登录。
2. New Project → Deploy from GitHub repo → 选择本仓库。
3. Railway 会自动识别 Node 项目并执行 `npm install` 与 start 脚本。
4. 若未自动识别，手动设置：
   - Build: `npm install`
   - Start: `npm start`
5. 部署完成后，在项目的 Settings → Domains 生成公开域名（或直接在 Deployments 复制 URL）。
6. 把链接发给朋友。

## 方式三：Docker / 任意 VPS
- 已提供 `Dockerfile`，直接构建运行即可：
  ```bash
  docker build -t poker .
  docker run -d -p 3000:3000 --name poker poker
  ```
- 然后在你自己的反代（Nginx/Caddy）或云厂商端口映射下暴露 3000 端口。

## 玩法规格
- 进入页面：填昵称 + 同一「房间号」即可同桌；首位进入房间的人决定该房间**倍率**
  （×1/×2/×5/×10，影响起始筹码与盲注）。
- 满 2 人后点「开始游戏」，一手结束后自动进入下一手。
- 下方「记分板」按筹码排名，记录每人的手数 / 胜场 / 总赢 / 最大底池。

## 本地自测
```bash
npm install
npm start          # 打开 http://localhost:3000
npm test           # 牌型单测 + 2000 手筹码守恒模拟
```
