# Backend Documentation

## Project Structure
```
Backend/
├── server.js              # Main server file
├── config/                # Configuration files
│   ├── db.js             # Database connection
│   ├── cloudinary.js     # Cloudinary setup
│   └── env.js            # Environment variables
├── models/                # MongoDB schemas
├── controllers/           # Business logic
├── routes/                # API endpoints
├── middlewares/           # Custom middleware
├── utils/                 # Helper functions
└── package.json           # Dependencies
```

## Server Configuration

### Main Server (`server.js`)
```javascript
const express = require("express");
const dotenv = require("dotenv");
require("express-async-errors");
const connectDB = require("./config/db");
const { errorHandler } = require("./middlewares/error.middleware");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const jwt = require("jsonwebtoken");

dotenv.config();
connectDB();

const app = express();

// CORS configuration
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/users", require("./routes/user.routes"));
app.use("/api/upload", require("./routes/upload.routes"));
app.use("/api/posts", require("./routes/post.routes"));
app.use("/api/notifications", require("./routes/notification.routes"));
app.use("/api/messages", require("./routes/message.routes"));
app.use("/api/groups", require("./routes/group.routes"));
app.use("/api/daily", require("./routes/daily.routes"));
app.use("/api/safety", require("./routes/safety.routes"));

// Socket.IO setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Socket authentication
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

// Socket event handlers
io.on("connection", (socket) => {
  // Implementation for socket events
});

// Error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
```

### Database Connection (`config/db.js`)
```javascript
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ MongoDB Error:", err);
    process.exit(1);
  }
};

module.exports = connectDB;
```

### Cloudinary Configuration (`config/cloudinary.js`)
```javascript
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = cloudinary;
```

## Controller Documentation

### User Controller (`controllers/user.controller.js`)

#### Register User
```javascript
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    let existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();

    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        profilePic: newUser.profilePic,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
```

#### Login User
```javascript
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePic: user.profilePic || null,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
```

#### Follow User
```javascript
const followUser = async (req, res) => {
  try {
    const userToFollow = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user.id);

    if (!userToFollow)
      return res.status(404).json({ message: "User not found" });
    if (currentUser.following.includes(userToFollow._id))
      return res.status(400).json({ message: "Already following" });

    currentUser.following.push(userToFollow._id);
    userToFollow.followers.push(currentUser._id);

    await currentUser.save();
    await userToFollow.save();

    // Emit socket event
    const io = req.app.get("io");
    const onlineUsers = req.app.get("onlineUsers");
    const socketId = onlineUsers.get(userToFollow._id.toString());
    if (socketId) {
      io.to(socketId).emit("newFollower", {
        followerId: currentUser._id,
        followerName: currentUser.name,
        followedId: userToFollow._id.toString(),
      });
    }

    res.json({ message: "Followed successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
```

### Post Controller (`controllers/post.controllers.js`)

#### Create Post
```javascript
const createPost = async (req, res) => {
  try {
    const { title, description = "" } = req.body;
    if (!title) return res.status(400).json({ message: "Title is required" });

    const hashtags = (description.match(/#\w+/g) || []).map((t) => t.substring(1).toLowerCase());
    const mentions = (description.match(/@\w+/g) || []).map((u) => u.substring(1));

    const lng = req.body?.lng != null ? Number(req.body.lng) : null;
    const lat = req.body?.lat != null ? Number(req.body.lat) : null;
    const locationName = req.body?.locationName || "";

    const doc = {
      title,
      description,
      mediaUrl: req.fileUrl,
      user: req.user._id,
      hashtags,
      mentions,
      locationName,
    };

    if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
      doc.geo = { type: "Point", coordinates: [lng, lat] };
    }

    const newPost = await Post.create(doc);

    // Handle mentions
    if (mentions.length > 0) {
      const mentionedUsers = await User.find({
        name: { $in: mentions.map((m) => new RegExp(`^${m}$`, "i")) },
      }).select("_id");

      for (const mentionedUser of mentionedUsers) {
        if (mentionedUser._id.toString() !== req.user._id.toString()) {
          await createNotification({
            req,
            receiverId: mentionedUser._id,
            senderId: req.user._id,
            type: "mention",
            postId: newPost._id,
            text: description,
          });
        }
      }
    }

    res.status(201).json(newPost);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
```

#### Get Posts
```javascript
const getAllPosts = async (req, res) => {
  try {
    let { page = 1, limit = 10, hashtag, mention, userId } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const filter = {};
    if (userId) filter.user = userId;
    if (hashtag) filter.hashtags = hashtag.toLowerCase();
    if (mention) filter.mentions = mention;

    const totalPosts = await Post.countDocuments(filter);

    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("user", "name profilePic")
      .populate("comments.user", "name profilePic")
      .populate("comments.replies.user", "name profilePic");

    res.json({
      success: true,
      currentPage: page,
      totalPages: Math.ceil(totalPosts / limit),
      totalPosts,
      posts,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
```

### Message Controller (`controllers/message.controllers.js`)

#### Send Message
```javascript
const sendMessage = async (req, res) => {
  try {
    const { to, text, messageType = "direct", groupId } = req.body;

    if (!text) {
      return res.status(400).json({ message: "Message text is required" });
    }

    let messageData = {
      from: req.user._id,
      text,
      messageType,
    };

    if (messageType === "direct") {
      if (!to) {
        return res.status(400).json({ message: "Recipient is required for direct messages" });
      }
      messageData.to = to;
    } else if (messageType === "group") {
      if (!groupId) {
        return res.status(400).json({ message: "Group ID is required for group messages" });
      }
      messageData.group = groupId;
    }

    const message = await Message.create(messageData);
    await message.populate("from", "name profilePic");

    // Emit socket event
    const io = req.app.get("io");
    const onlineUsers = req.app.get("onlineUsers");

    if (messageType === "direct") {
      const recipientSocketId = onlineUsers.get(to);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("receiveDirectMessage", message);
      }
    } else if (messageType === "group") {
      io.to(`group_${groupId}`).emit("receiveGroupMessage", message);
    }

    res.json(message);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
```

### Daily Controller (`controllers/daily.controllers.js`)

#### Get Today's Prompt
```javascript
const getTodayPrompt = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    let prompt = await DailyPrompt.findOne({ dateKey: today });

    if (!prompt) {
      // Create default prompt if none exists
      prompt = await DailyPrompt.create({
        dateKey: today,
        text: "Share a moment from your day",
        dropsAt: new Date().toISOString(),
      });
    }

    // Check if user has posted today
    const userEntry = await DailyCircleEntry.findOne({
      user: req.user._id,
      dateKey: today,
    });

    res.json({
      prompt,
      posted: !!userEntry,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
```

#### Post Daily Entry
```javascript
const postTodayEntry = async (req, res) => {
  try {
    const { text, visibility = "followers" } = req.body;
    const today = new Date().toISOString().split('T')[0];

    // Check if user already posted today
    const existingEntry = await DailyCircleEntry.findOne({
      user: req.user._id,
      dateKey: today,
    });

    if (existingEntry) {
      return res.status(400).json({ message: "Already posted today" });
    }

    const entryData = {
      user: req.user._id,
      dateKey: today,
      text: text || "",
      mediaUrl: req.fileUrl,
      visibility,
    };

    const entry = await DailyCircleEntry.create(entryData);
    await entry.populate("user", "name profilePic");

    // Update streak
    await updateUserStreak(req.user._id);

    // Emit socket event
    const io = req.app.get("io");
    io.emit("dailyPosted", { entry });

    res.json(entry);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
```

## Middleware Documentation

### Authentication Middleware (`middlewares/auth.middleware.js`)
```javascript
const jwt = require("jsonwebtoken");
const User = require("../models/user.models");

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select("-password");
      next();
    } catch (err) {
      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }
};

module.exports = protect;
```

### Upload Middleware (`middlewares/upload.middleware.js`)
```javascript
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "circle_uploads",
    allowed_formats: ["jpg", "png", "jpeg", "gif", "mp4", "mov", "webm"],
    resource_type: "auto",
  },
});

const upload = multer({ storage });

module.exports = upload;
```

### Error Middleware (`middlewares/error.middleware.js`)
```javascript
const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
};

module.exports = { errorHandler };
```

## Utility Functions

### Notification Helper (`utils/functions.js`)
```javascript
const createNotification = async ({ req, receiverId, senderId, type, postId, commentId, replyId, text, actionLink }) => {
  try {
    const notification = await Notification.create({
      receiver: receiverId,
      sender: senderId,
      type,
      post: postId,
      comment: commentId,
      reply: replyId,
      text,
      actionLink,
    });

    // Emit socket event if user is online
    const io = req.app.get("io");
    const onlineUsers = req.app.get("onlineUsers");
    const socketId = onlineUsers.get(receiverId.toString());

    if (socketId) {
      io.to(socketId).emit("newNotification", {
        notification,
        message: getNotificationMessage(type, text),
      });
    }

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};

const getNotificationMessage = (type, text) => {
  switch (type) {
    case "like":
      return "liked your post";
    case "comment":
      return "commented on your post";
    case "follow":
      return "started following you";
    case "mention":
      return "mentioned you in a post";
    default:
      return text || "sent you a notification";
  }
};
```

## Route Documentation

### User Routes (`routes/user.routes.js`)
```javascript
const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const { register, login, getProfile, followUser, unfollowUser, searchuser, getUserById, getFollowers, getFollowing, listCloseFriends, addCloseFriend, removeCloseFriend, registerPushToken, blockUser, unblockUser } = require("../controllers/user.controller");

// Public routes
router.post("/register", register);
router.post("/login", login);

// Protected routes
router.get("/me", auth, getProfile);
router.post("/:id/follow", auth, followUser);
router.post("/:id/unfollow", auth, unfollowUser);
router.get("/search", auth, searchuser);
router.get("/:id/followers", auth, getFollowers);
router.get("/:id/following", auth, getFollowing);
router.get("/:id", auth, getUserById);

module.exports = router;
```

### Post Routes (`routes/post.routes.js`)
```javascript
const express = require("express");
const router = express.Router();
const postController = require("../controllers/post.controllers");
const { uploadToCloudinary } = require("../controllers/upload.controllers");
const upload = require("../middlewares/upload.middleware");
const protect = require("../middlewares/auth.middleware");

// Create with media (multipart/form-data)
router.post("/", protect, upload.single("file"), uploadToCloudinary, postController.createPost);

// Feed (with pagination: ?page=1&limit=10)
router.get("/", protect, postController.getAllPosts);
router.get("/explore", protect, postController.getExplorePosts);

// My posts (also paginated)
router.get("/me", protect, postController.getMyPosts);

// Delete
router.delete("/:id", protect, postController.deletePost);

// Like/unlike post
router.put("/:id/like", protect, postController.likePost);

// Comments
router.post("/:id/comment", protect, postController.addComment);
router.put("/:id/comment/:commentId", protect, postController.editComment);
router.delete("/:id/comment/:commentId", protect, postController.deleteComment);

// Save Post
router.put("/:id/save", protect, postController.savePost);
router.get("/saved", protect, postController.getSavedPosts);

module.exports = router;
```

### Message Routes (`routes/message.routes.js`)
```javascript
const express = require("express");
const router = express.Router();
const messageController = require("../controllers/message.controllers");
const auth = require("../middlewares/auth.middleware");

// Get chat list
router.get("/chats", auth, messageController.getChats);

// Direct messages
router.get("/direct/:userId", auth, messageController.getDirectMessages);
router.post("/direct/:userId/read", auth, messageController.markDirectMessagesRead);

// Group messages
router.get("/group/:groupId", auth, messageController.getGroupMessages);
router.post("/group/:groupId/read", auth, messageController.markGroupMessagesRead);

// Send message
router.post("/", auth, messageController.sendMessage);

module.exports = router;
```

### Daily Routes (`routes/daily.routes.js`)
```javascript
const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const upload = require("../middlewares/upload.middleware");
const { getTodayPrompt, postTodayEntry, getTodayFeed, getMyStreak, getRings, getEntryByUser, getGroupDailyFeed, incrementView, reactToEntry, toggleHighlight, getHighlights, getReactionsSummary, listReactors, getCaptions, putCaptions } = require("../controllers/daily.controllers");

// Get today prompt and whether user has posted
router.get("/prompt", auth, getTodayPrompt);

// Post today's entry (multipart supported)
router.post("/entry", auth, upload.single("file"), postTodayEntry);

// Get today's unlocked feed (requires user posted)
router.get("/feed", auth, getTodayFeed);

// Get my streak
router.get("/streak", auth, getMyStreak);

// Rings (followers who posted today)
router.get("/rings", auth, getRings);

// Fetch a specific user's entry (requires unlock unless own)
router.get("/entry/:userId", auth, getEntryByUser);

// Group-specific Daily feed for today (requires membership)
router.get("/group/:groupId", auth, getGroupDailyFeed);

// Views / reactions / highlights
router.post("/view", auth, incrementView);
router.post("/react", auth, reactToEntry);
router.post("/highlight", auth, toggleHighlight);

// Highlights list
router.get("/highlights", auth, getHighlights);

// Reactions summary and reactors list
router.get("/:entryId/reactions", auth, getReactionsSummary);
router.get("/:entryId/reactors", auth, listReactors);

// Captions
router.get("/:entryId/captions", auth, getCaptions);
router.put("/:entryId/captions", auth, putCaptions);

module.exports = router;
```

## Socket.IO Implementation

### Socket Event Handlers
```javascript
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
```

## Security Implementation

### JWT Token Management
```javascript
// Token generation with expiration
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// Token verification
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error("Invalid token");
  }
};
```

### Password Security
```javascript
// Password hashing
const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

// Password verification
const verifyPassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};
```

### Input Validation
```javascript
// Request validation middleware
const validateUserInput = (req, res, next) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ message: "Missing required fields" });
  }
  
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ message: "Password too short" });
  }
  
  next();
};

// Email validation helper
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};
```

## Error Handling

### Global Error Handler
```javascript
const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
};
```

### Async Error Handler
```javascript
// Wrapper for async functions
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
```

### Custom Error Classes
```javascript
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Usage in controllers
const someController = async (req, res, next) => {
  try {
    // Controller logic
    if (!user) {
      throw new AppError('User not found', 404);
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
};
```

## Performance Optimization

### Database Optimization
```javascript
// Index creation for performance
const createIndexes = async () => {
  // User indexes
  await User.collection.createIndex({ "email": 1 }, { unique: true });
  await User.collection.createIndex({ "username": 1 });

  // Post indexes
  await Post.collection.createIndex({ "user": 1, "createdAt": -1 });
  await Post.collection.createIndex({ "hashtags": 1 });
  await Post.collection.createIndex({ "mentions": 1 });
  await Post.collection.createIndex({ "geo": "2dsphere" });

  // Message indexes
  await Message.collection.createIndex({ "from": 1, "to": 1, "createdAt": -1 });
  await Message.collection.createIndex({ "group": 1, "createdAt": -1 });

  // DailyCircleEntry indexes
  await DailyCircleEntry.collection.createIndex({ "user": 1, "dateKey": 1, "group": 1 }, { unique: true, partialFilterExpression: { group: { $exists: true } } });
  await DailyCircleEntry.collection.createIndex({ "createdAt": 1 }, { expireAfterSeconds: 60 * 60 * 24 });

  // Notification indexes
  await Notification.collection.createIndex({ "receiver": 1, "isRead": 1, "createdAt": -1 });
};
```

### Query Optimization
```javascript
// Efficient post querying with population
const getPostsWithOptimization = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("user", "name profilePic")
      .populate({
        path: "comments",
        populate: {
          path: "user",
          select: "name profilePic"
        },
        options: { limit: 5 } // Limit comments for performance
      })
      .lean(); // Convert to plain JavaScript objects for better performance

    res.json(posts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
```

### Caching Strategy
```javascript
// Simple in-memory caching for frequently accessed data
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getCachedData = (key) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
};

const setCachedData = (key, data) => {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
};

// Usage in controllers
const getUserProfile = async (req, res) => {
  try {
    const userId = req.params.id;
    const cacheKey = `user_${userId}`;
    
    let user = getCachedData(cacheKey);
    if (!user) {
      user = await User.findById(userId).select("-password");
      setCachedData(cacheKey, user);
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
```

## Testing

### Unit Tests
```javascript
// Example test for user controller
const request = require('supertest');
const app = require('../server');
const User = require('../models/user.models');

describe('User API', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  test('should register new user', async () => {
    const response = await request(app)
      .post('/api/users/register')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      });
    
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('token');
    expect(response.body.user).toHaveProperty('name', 'Test User');
  });

  test('should login existing user', async () => {
    // First register a user
    await request(app)
      .post('/api/users/register')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      });

    // Then login
    const response = await request(app)
      .post('/api/users/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
  });
});
```

### Integration Tests
```javascript
// Example integration test for post creation
describe('Post API', () => {
  let token;
  let user;

  beforeEach(async () => {
    // Create test user and get token
    const response = await request(app)
      .post('/api/users/register')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      });
    
    token = response.body.token;
    user = response.body.user;
  });

  test('should create post with authentication', async () => {
    const response = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'Test Post')
      .field('description', 'Test description')
      .attach('file', 'test-image.jpg');
    
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('title', 'Test Post');
    expect(response.body).toHaveProperty('user', user.id);
  });
});
```

## Deployment

### Production Configuration
```javascript
// Production environment setup
const productionConfig = {
  // Database connection with retry logic
  database: {
    uri: process.env.MONGO_URI,
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    }
  },

  // Security headers
  security: {
    helmet: true,
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    }
  },

  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  }
};
```

### PM2 Configuration
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'social-app-backend',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

This comprehensive backend documentation covers all aspects of the server implementation, from basic setup to advanced features like real-time communication, security, and performance optimization.