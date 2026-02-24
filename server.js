const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' } // 允许所有来源，生产环境应限制
});

// 存储房间信息: roomId -> { players: [socketId, socketId], gameState: ... }
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);

  // 创建房间
  socket.on('createRoom', (callback) => {
    // 生成一个短随机房间号
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    rooms.set(roomId, { players: [socket.id] });
    socket.join(roomId);
    socket.emit('roomCreated', roomId);
    console.log(`房间 ${roomId} 由 ${socket.id} 创建`);
    callback({ roomId });
  });

  // 加入房间
  socket.on('joinRoom', (roomId, callback) => {
    const room = rooms.get(roomId);
    if (!room) {
      callback({ error: '房间不存在' });
      return;
    }
    if (room.players.length >= 2) {
      callback({ error: '房间已满' });
      return;
    }
    room.players.push(socket.id);
    socket.join(roomId);
    // 通知双方游戏开始
    io.to(roomId).emit('gameStart', { players: room.players });
    callback({ success: true });
    console.log(`${socket.id} 加入房间 ${roomId}`);
  });

  // 处理落子
  socket.on('move', (data) => {
    const { roomId, row, col, player } = data;
    // 广播给房间内其他玩家
    socket.to(roomId).emit('move', { row, col, player });
  });

  // 处理重新开始
  socket.on('restart', (roomId) => {
    socket.to(roomId).emit('restart');
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log('用户断开:', socket.id);
    // 从所有房间中移除该玩家，并通知对方
    rooms.forEach((room, roomId) => {
      const index = room.players.indexOf(socket.id);
      if (index !== -1) {
        room.players.splice(index, 1);
        if (room.players.length === 0) {
          rooms.delete(roomId);
        } else {
          // 通知对手对方已离开
          io.to(roomId).emit('opponentLeft');
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});