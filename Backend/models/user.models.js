const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, unique: true, sparse: true, trim: true, lowercase: true, default: null },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePic: { type: String, default: "" },
  savedPosts: [
    { type: mongoose.Schema.Types.ObjectId, ref: "Post" }
  ],
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  highlights: [{ type: mongoose.Schema.Types.ObjectId, ref: "DailyCircleEntry" }],
  closeFriends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  expoPushTokens: [{ type: String }],
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  bio: { type: String, default: "" },
  website: { type: String, default: "" },
  notInterestedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
  refreshTokens: [
    new mongoose.Schema({
      tokenHash: { type: String, required: true },
      expiresAt: { type: Date, required: true },
      createdAt: { type: Date, default: Date.now },
      userAgent: { type: String, default: '' },
      ip: { type: String, default: '' },
    }, { _id: false })
  ],
  notificationPrefs: new mongoose.Schema({
    like: { type: Boolean, default: true },
    comment: { type: Boolean, default: true },
    reply: { type: Boolean, default: true },
    mention: { type: Boolean, default: true },
    follow: { type: Boolean, default: true },
    save: { type: Boolean, default: true },
    daily: { type: Boolean, default: true },
    quiet: new mongoose.Schema({
      enabled: { type: Boolean, default: false },
      start: { type: String, default: '22:00' },
      end: { type: String, default: '07:00' },
    }, { _id: false }),
  }, { _id: false }),
  customStatus: new mongoose.Schema({
    text: { type: String, default: '' },
    emoji: { type: String, default: '' },
    expiresAt: { type: Date },
  }, { _id: false }),
  // Privacy controls
  privacy: new mongoose.Schema({
    showOnline: { type: Boolean, default: true },
    showLastSeen: { type: Boolean, default: true },
    sendTypingIndicators: { type: Boolean, default: true },
    sendReadReceipts: { type: Boolean, default: true },
    allowDMsFrom: { type: String, enum: ['everyone', 'followers', 'none'], default: 'everyone' },
  }, { _id: false }),
  lastActiveAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Ensure an index on username for fast lookups (unique+sparse allows missing values)
try {
  userSchema.index({ username: 1 }, { unique: true, sparse: true });
} catch {}

module.exports = mongoose.model("User", userSchema);
