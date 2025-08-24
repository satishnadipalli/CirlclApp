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

dotenv.config();
connectDB();

const app = express();

app.use(helmet());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Allow your frontend origin
app.use(
  cors({
    origin: (origin, cb) => {
      const allowed = process.env.ALLOWED_ORIGIN || "*"
      if (allowed === "*") return cb(null, true)
      if (!origin) return cb(null, true)
      if (String(origin).startsWith(allowed)) return cb(null, true)
      return cb(new Error("Not allowed by CORS"))
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: Boolean(process.env.CORS_CREDENTIALS === 'true'),
  })
);

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use("/api", apiLimiter);

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
  socket.on("register", (clientUserId) => {
    const userId = socket.userId || clientUserId;
    if (!userId) return;
    onlineUsers.set(userId, socket.id);
    socketToUser.set(socket.id, userId);
    io.emit("userStatusChange", { userId, status: "online" });
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

  // Leave group room
  socket.on("leaveGroup", (groupId) => {
    socket.leave(`group_${groupId}`);
  });

  // Typing indicators
  socket.on("typing", ({ from, to }) => {
    const recipientSocketId = onlineUsers.get(to);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("typing", { from });
    }
  });

  socket.on("stopTyping", ({ from, to }) => {
    const recipientSocketId = onlineUsers.get(to);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("stopTyping", { from });
    }
  });

  // Group typing
  socket.on("groupTyping", ({ groupId, userId, userName }) => {
    socket.to(`group_${groupId}`).emit("groupTyping", { userId, userName, groupId });
  });

  socket.on("groupStopTyping", ({ groupId, userId }) => {
    socket.to(`group_${groupId}`).emit("groupStopTyping", { userId, groupId });
  });

  // Disconnect
  socket.on("disconnect", () => {
    const userId = socketToUser.get(socket.id) || socket.userId;
    if (!userId) return;
    onlineUsers.delete(userId);
    socketToUser.delete(socket.id);
    io.emit("userStatusChange", { userId, status: "offline" });
  });
});

// Register error handler after routes and socket
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);