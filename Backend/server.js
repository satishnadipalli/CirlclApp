const express = require("express");
const dotenv = require("dotenv");
require("express-async-errors");
const connectDB = require("./config/db");
const { errorHandler } = require("./middlewares/error.middleware");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
// Optional Sentry + OpenTelemetry hooks (no-ops if env not set)
let Sentry = null
try {
  if (process.env.SENTRY_DSN) {
    Sentry = require('@sentry/node')
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1) })
  }
} catch {}

const User = require("./models/user.models");

dotenv.config();
connectDB();

const app = express();
if (Sentry) {
  try { app.use(Sentry.Handlers.requestHandler()) } catch {}
}

app.use(helmet());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Allow your frontend origin
app.use(
  cors({
    origin: (origin, cb) => {
      const raw = process.env.ALLOWED_ORIGIN || process.env.ALLOWED_ORIGINS || "*"
      if (raw === "*") return cb(null, true)
      const allowlist = String(raw)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      if (!origin) return cb(null, true)
      if (allowlist.includes(origin)) return cb(null, true)
      return cb(new Error("Not allowed by CORS"))
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: Boolean(process.env.CORS_CREDENTIALS === 'true'),
  })
);

// Global and route-specific rate limits
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use("/api", apiLimiter);

const authTightLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30 });
app.use("/api/users/login", authTightLimiter);
app.use("/api/users/refresh", authTightLimiter);
const uploadLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 60 });
app.use("/api/upload", uploadLimiter);
const msgLimiter = rateLimit({ windowMs: 1 * 60 * 1000, max: 300 });
app.use("/api/messages", msgLimiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/users", require("./routes/user.routes"));
app.use("/api/upload", require("./routes/upload.routes"));
app.use("/api/posts", require("./routes/post.routes"));
app.use("/api/notifications", require("./routes/notification.routes"));
app.use("/api/messages", require("./routes/message.routes")); // new chat route
app.use("/api/groups", require("./routes/group.routes")); // Added group routes for group chat functionality
app.use("/api/daily", require("./routes/daily.routes")); // Daily Circle feature
app.use("/api/safety", require("./routes/safety.routes"));
app.use("/api/swarms", require("./routes/swarm.routes"));

// Test Route
app.get("/", (req, res) => res.send("API is running..."));

// Create HTTP server
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: { origin: process.env.ALLOWED_ORIGIN || "*", methods: ["GET", "POST"], credentials: Boolean(process.env.CORS_CREDENTIALS === 'true') },
});

// Map to track online users
const onlineUsers = new Map();
const socketToUser = new Map();

// Attach io & onlineUsers to app so controllers can use
app.set("io", io);
app.set("onlineUsers", onlineUsers);

// Authenticate sockets with JWT from handshake.auth.token
io.use((socket, next) => {
  try {
    const token = socket.handshake?.auth?.token;
    if (!token) return next(new Error("Unauthorized"));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (e) {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  // Register user (trust verified JWT over client payload)
  socket.on("register", async (clientUserId) => {
    const userId = socket.userId || clientUserId;
    if (!userId) return;
    onlineUsers.set(userId, socket.id);
    socketToUser.set(socket.id, userId);
    try {
      const u = await User.findById(userId).select('privacy')
      const showOnline = u?.privacy?.showOnline !== false
      if (showOnline) io.emit("userStatusChange", { userId, status: "online" });
    } catch {}
    try {
      await User.findByIdAndUpdate(userId, { $set: { lastActiveAt: new Date() } })
      const u = await User.findById(userId).select('customStatus privacy')
      const showOnline = u?.privacy?.showOnline !== false
      if (showOnline && (u?.customStatus?.text || u?.customStatus?.emoji)) {
        io.emit("userStatusChange", { userId, status: "online", customStatus: { text: u.customStatus.text || '', emoji: u.customStatus.emoji || '' } })
      }
    } catch {}
  });

  // Direct messaging (no-op; REST controller will emit after persistence)
  socket.on("sendMessage", () => {
    // intentionally no-op to avoid duplicate emits
  });

  // Group messaging (no-op; REST controller will emit after persistence)
  socket.on("sendGroupMessage", () => {
    // intentionally no-op to avoid duplicate emits
  });

  // Join group room
  socket.on("joinGroup", (groupId) => {
    socket.join(`group_${groupId}`);
  });

  // Swarm rooms
  socket.on("joinSwarm", (swarmId) => {
    socket.join(`swarm_${swarmId}`)
  })
  socket.on("leaveSwarm", (swarmId) => {
    socket.leave(`swarm_${swarmId}`)
  })

  // Leave group room
  socket.on("leaveGroup", (groupId) => {
    socket.leave(`group_${groupId}`);
  });

  // Typing indicators
  // Simple in-memory cache for privacy checks to reduce DB hits
  const privacyCache = new Map(); // key: userId -> { sendTypingIndicators, ts }
  let lastRelayByKey = new Map()
  socket.on("typing", ({ from, to }) => {
    const recipientSocketId = onlineUsers.get(to);
    if (!recipientSocketId) return
    const now = Date.now()
    const cached = privacyCache.get(String(from))
    const checkSender = cached && (now - cached.ts < 30000)
      ? Promise.resolve({ privacy: { sendTypingIndicators: cached.sendTypingIndicators } })
      : User.findById(from).select('privacy').then((u) => { privacyCache.set(String(from), { sendTypingIndicators: u?.privacy?.sendTypingIndicators !== false, ts: now }); return u })
    Promise.all([
      checkSender,
      User.findById(to).select('blockedUsers privacy followers'),
      User.findById(from).select('blockedUsers'),
    ]).then(([sender, receiver, senderDoc]) => {
      const allowTyping = (sender?.privacy?.sendTypingIndicators !== false)
      if (!allowTyping) return
      // Block checks (either direction)
      const recvBlocked = Array.isArray(receiver?.blockedUsers) && receiver.blockedUsers.some((id) => String(id) === String(from))
      const sndBlocked = Array.isArray(senderDoc?.blockedUsers) && senderDoc.blockedUsers.some((id) => String(id) === String(to))
      if (recvBlocked || sndBlocked) return
      // DM permission checks
      const allowDMs = receiver?.privacy?.allowDMsFrom || 'everyone'
      if (allowDMs === 'none') return
      if (allowDMs === 'followers') {
        const isFollower = Array.isArray(receiver?.followers) && receiver.followers.some((id) => String(id) === String(from))
        if (!isFollower) return
      }
      const key = `${from}->${to}`
      const last = lastRelayByKey.get(key) || 0
      if (now - last < 200) return
      lastRelayByKey.set(key, now)
      io.to(recipientSocketId).emit("typing", { from });
    }).catch(() => {})
  });

  socket.on("stopTyping", ({ from, to }) => {
    const recipientSocketId = onlineUsers.get(to);
    if (!recipientSocketId) return
    Promise.all([
      User.findById(from).select('privacy blockedUsers'),
      User.findById(to).select('blockedUsers privacy followers'),
    ]).then(([sender, receiver]) => {
      if (sender?.privacy?.sendTypingIndicators === false) return
      const recvBlocked = Array.isArray(receiver?.blockedUsers) && receiver.blockedUsers.some((id) => String(id) === String(from))
      const sndBlocked = Array.isArray(sender?.blockedUsers) && sender.blockedUsers.some((id) => String(id) === String(to))
      if (recvBlocked || sndBlocked) return
      const allowDMs = receiver?.privacy?.allowDMsFrom || 'everyone'
      if (allowDMs === 'none') return
      if (allowDMs === 'followers') {
        const isFollower = Array.isArray(receiver?.followers) && receiver.followers.some((id) => String(id) === String(from))
        if (!isFollower) return
      }
      io.to(recipientSocketId).emit("stopTyping", { from });
    }).catch(() => {})
  });

  // Group typing
  socket.on("groupTyping", ({ groupId, userId, userName }) => {
    socket.to(`group_${groupId}`).emit("groupTyping", { userId, userName, groupId });
  });

  socket.on("groupStopTyping", ({ groupId, userId }) => {
    socket.to(`group_${groupId}`).emit("groupStopTyping", { userId, groupId });
  });

  // Heartbeat from clients to update lastActiveAt
  socket.on("heartbeat", async () => {
    const uid = socketToUser.get(socket.id) || socket.userId
    if (!uid) return
    try { await User.findByIdAndUpdate(uid, { $set: { lastActiveAt: new Date() } }) } catch {}
  });

  // Disconnect
  socket.on("disconnect", async () => {
    const userId = socketToUser.get(socket.id) || socket.userId;
    if (!userId) return;
    onlineUsers.delete(userId);
    socketToUser.delete(socket.id);
    try {
      const u = await User.findById(userId).select('privacy')
      const showOnline = u?.privacy?.showOnline !== false
      if (showOnline) io.emit("userStatusChange", { userId, status: "offline" });
    } catch {}
    try { await User.findByIdAndUpdate(userId, { $set: { lastActiveAt: new Date() } }) } catch {}
    //here thihs userStatus Chage helps us to chage the status of the user to make the status to noarmal to probable stuff and it eliminates the other user info profiles to a broging stuff
  });

  // Delivery ack from clients (optional enhancement): when a client receives a message, it can ack delivery
  socket.on('delivered', async (payload) => {
    try {
      const Message = require('./models/message.model')
      const userId = socketToUser.get(socket.id) || socket.userId
      if (!userId) return
      const msgId = String(payload?.messageId || '')
      if (!msgId) return
      await Message.updateOne({ _id: msgId }, { $addToSet: { deliveredTo: userId }, $set: { deliveredAt: new Date() } })
      const io = socket.server
      const senderSocket = app.get('onlineUsers').get(String(payload?.senderId || ''))
      if (senderSocket) io.to(senderSocket).emit('messagesDelivered', { messageId: msgId, deliveredTo: String(userId), at: new Date().toISOString() })
    } catch {}
  })
  // this will make the process simple and clear 
  // so that the userId with the user can follow the flow of the game though which the game can continue side
  // the power resides 
});

// Register error handler after routes and socket
if (Sentry) {
  try { app.use(Sentry.Handlers.errorHandler()) } catch {}
}
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);