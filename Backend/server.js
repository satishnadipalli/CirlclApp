const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const { errorHandler } = require("./middlewares/error.middleware");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

dotenv.config();
connectDB();

const app = express();

// Allow your frontend origin
app.use(
  cors({
    origin: "http://127.0.0.1:5500", // frontend URL
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(errorHandler);

// Routes
app.use("/api/users", require("./routes/user.routes"));
app.use("/api/upload", require("./routes/upload.routes"));
app.use("/api/posts", require("./routes/post.routes"));
app.use("/api/notifications", require("./routes/notification.routes"));
app.use("/api/messages", require("./routes/message.routes")); // new chat route
app.use("/api/groups", require("./routes/group.routes")); // Added group routes for group chat functionality

// Test Route
app.get("/", (req, res) => res.send("API is running..."));

// Create HTTP server
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Map to track online users
const onlineUsers = new Map();
const socketToUser = new Map();

// Attach io & onlineUsers to app so controllers can use
app.set("io", io);
app.set("onlineUsers", onlineUsers);

io.on("connection", (socket) => {
  // Register user
  socket.on("register", (userId) => {
    onlineUsers.set(userId, socket.id);
    socketToUser.set(socket.id, userId);
    console.log("✅ Registered user:", userId, "with socket:", socket.id);
    io.emit("userStatusChange", { userId, status: "online" });
  });

  // Direct messaging
  socket.on("sendMessage", ({ to, text, replyTo }) => {
    console.log("hi trigering");
    const recipientSocketId = onlineUsers.get(to);
    const fromUserId = socketToUser.get(socket.id);

    if (!fromUserId) {
      console.log("⚠️ No fromUserId found for socket:", socket.id);
      return;
    }

    const payload = {
      from: fromUserId,
      to,
      text,
      createdAt: new Date(),
      messageType: "direct",
      replyTo: replyTo || null,
    };

    // Debug logs
    console.log("📝 Direct message payload:", payload);
    console.log("🎯 Recipient socketId:", recipientSocketId);

    // Send to recipient if online
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("receiveDirectMessage", payload);
      console.log("📡 Emitted to recipient:", to);
    } else {
      console.log("❌ Recipient is offline, not emitted:", to);
    }

    // Always send back to sender so they also see it live
    socket.emit("receiveDirectMessage", payload);
    console.log("📡 Emitted back to sender:", fromUserId);
  });

  // Group messaging
  socket.on("sendGroupMessage", ({ groupId, text, senderId, replyTo }) => {
    const payload = {
      from: senderId,
      group: groupId,
      text,
      createdAt: new Date(),
      messageType: "group",
      replyTo: replyTo || null,
    };

    // Send to everyone in the room except sender
    socket.to(`group_${groupId}`).emit("receiveGroupMessage", payload);

    // Also send back to sender
    socket.emit("receiveGroupMessage", payload);

    console.log(`Group message from ${senderId} to group ${groupId}: ${text}`);
  });

  // Join group room
  socket.on("joinGroup", (groupId) => {
    socket.join(`group_${groupId}`);
    console.log(`User ${socket.id} joined group ${groupId}`);
  });

  // Leave group room
  socket.on("leaveGroup", (groupId) => {
    socket.leave(`group_${groupId}`);
    console.log(`User ${socket.id} left group ${groupId}`);
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
  socket.on("disconnect", (reason) => {
    const userId = socketToUser.get(socket.id);
    if (!userId) return; // already cleaned
    console.log("User disconnected:", socket.id, reason);
    onlineUsers.delete(userId);
    socketToUser.delete(socket.id);
    io.emit("userStatusChange", { userId, status: "offline" });
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
