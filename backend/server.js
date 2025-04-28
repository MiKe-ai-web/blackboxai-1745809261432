const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

const PORT = process.env.PORT || 3000;

// In-memory storage for demo purposes
const users = new Map(); // username -> { passwordHash, profileName, profilePic, online, lastSeen, socketId, contacts, priorityContacts, reports, blocked, profile }
const sockets = new Map(); // socketId -> username
const groups = new Map(); // groupId -> { name, profilePic, members: Set, directors: Set, muted: boolean, closed: boolean }
const calls = new Map(); // callId -> { participants: Set, isGroupCall: boolean }

app.use(express.json());

// Helper functions
function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

// User registration
app.post('/register', (req, res) => {
  const { username, password, profileName, profilePic } = req.body;
  if (users.has(username)) {
    return res.status(400).json({ error: 'Username already exists' });
  }
  const passwordHash = hashPassword(password);
  users.set(username, {
    passwordHash,
    profileName: profileName || username,
    profilePic: profilePic || '',
    online: false,
    lastSeen: null,
    socketId: null,
    contacts: new Set(),
    priorityContacts: new Set(),
    reports: 0,
    blocked: false,
    profile: {}
  });
  res.json({ success: true });
});

// User login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.get(username);
  if (!user) {
    return res.status(400).json({ error: 'Invalid username or password' });
  }
  if (!verifyPassword(password, user.passwordHash)) {
    return res.status(400).json({ error: 'Invalid username or password' });
  }
  if (user.blocked) {
    return res.status(403).json({ error: 'Account suspended due to reports' });
  }
  res.json({ success: true, profileName: user.profileName, profilePic: user.profilePic });
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('login', (username) => {
    if (!users.has(username)) {
      socket.emit('login_error', 'User not found');
      return;
    }
    const user = users.get(username);
    user.online = true;
    user.socketId = socket.id;
    user.lastSeen = new Date();
    sockets.set(socket.id, username);

    // Notify contacts about online status
    user.contacts.forEach(contact => {
      const contactUser = users.get(contact);
      if (contactUser && contactUser.online && contactUser.socketId) {
        io.to(contactUser.socketId).emit('contact_online', username);
      }
    });

    socket.emit('login_success', { profileName: user.profileName, profilePic: user.profilePic });
  });

  socket.on('disconnect', () => {
    const username = sockets.get(socket.id);
    if (username) {
      const user = users.get(username);
      if (user) {
        user.online = false;
        user.lastSeen = new Date();
        user.socketId = null;

        // Notify contacts about offline status
        user.contacts.forEach(contact => {
          const contactUser = users.get(contact);
          if (contactUser && contactUser.online && contactUser.socketId) {
            io.to(contactUser.socketId).emit('contact_offline', username);
          }
        });
      }
      sockets.delete(socket.id);
    }
    console.log('User disconnected:', socket.id);
  });

  // Messaging events, group management, calls, etc. will be added here

  // WebRTC signaling for calls
  socket.on('call_user', (data) => {
    const { to, offer, callId, isGroupCall } = data;
    const toUser = users.get(to);
    if (toUser && toUser.socketId) {
      io.to(toUser.socketId).emit('incoming_call', { from: sockets.get(socket.id), offer, callId, isGroupCall });
    }
  });

  socket.on('answer_call', (data) => {
    const { to, answer, callId } = data;
    const toUser = users.get(to);
    if (toUser && toUser.socketId) {
      io.to(toUser.socketId).emit('call_answered', { from: sockets.get(socket.id), answer, callId });
    }
  });

  socket.on('ice_candidate', (data) => {
    const { to, candidate, callId } = data;
    const toUser = users.get(to);
    if (toUser && toUser.socketId) {
      io.to(toUser.socketId).emit('ice_candidate', { from: sockets.get(socket.id), candidate, callId });
    }
  });

  // Additional events for group calls, messaging, etc. to be implemented
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
