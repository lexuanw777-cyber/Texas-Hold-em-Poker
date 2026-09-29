// server.js — Express 静态服务 + Socket.IO 房间
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { Game } = require('./game');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server);

const rooms = {}; // roomId -> Game
function getRoom(id, opts) {
  if (!rooms[id]) rooms[id] = new Game(id, opts || {});
  return rooms[id];
}
function broadcast(roomId) {
  const game = rooms[roomId];
  if (!game) return;
  game.players.forEach(p => io.to(p.id).emit('state', game.getStateFor(p.id)));
}

io.on('connection', (socket) => {
  let roomId = null;
  let playerName = null;

  socket.on('join', ({ room, name, multiplier }) => {
    roomId = (room || 'default').toString().trim() || 'default';
    playerName = (name || '玩家').toString().trim().slice(0, 16) || '玩家';
    socket.join(roomId);
    const game = getRoom(roomId, { multiplier });
    game.addPlayer(socket.id, playerName);
    game.logMsg(`${playerName} 加入房间`);
    broadcast(roomId);
    socket.emit('joined', { roomId });
  });

  socket.on('start', () => {
    const game = rooms[roomId];
    if (!game) return;
    if (game.stage === 'waiting' || game.stage === 'ended') {
      if (game.eligible().length < 2) { socket.emit('error', '至少需要 2 名玩家才能开始'); return; }
      game.startHand();
      broadcast(roomId);
    }
  });

  socket.on('action', (action) => {
    const game = rooms[roomId];
    if (!game) return;
    const res = game.handleAction(socket.id, action);
    if (res && res.error) socket.emit('toast', res.error);
    broadcast(roomId);
  });

  socket.on('chat', (msg) => {
    const game = rooms[roomId];
    if (!game) return;
    const text = (msg || '').toString().slice(0, 200);
    if (!text) return;
    game.logMsg(`${playerName}: ${text}`);
    broadcast(roomId);
  });

  socket.on('disconnect', () => {
    const game = rooms[roomId];
    if (!game) return;
    game.removePlayer(socket.id);
    broadcast(roomId);
    if (game.players.length === 0) { clearTimeout(game.timeoutHandle); delete rooms[roomId]; }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`德州扑克已启动: http://localhost:${PORT}`);
});
