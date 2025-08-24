
const mongoose = require("mongoose");

const replySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
    hashtags: [String],
    mentions: [String],

    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

const commentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    profilePic: { type: String },
    hashtags: [String],
    mentions: [String],
    name: { type: String },
    replies: [replySchema],
  },
  { timestamps: true }
);

const postSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" }, // ✅ was missing
    mediaUrl: { type: String },
    hashtags: [String],
    mentions: [String],
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: [commentSchema],
    locationName: { type: String, default: "" },
    geo: {
      type: { type: String, enum: ["Point"] },
      coordinates: { type: [Number] }, // [lng, lat]
    },
    // Reels/watch metrics (aggregated)
    impressions: { type: Number, default: 0 },
    watchCount: { type: Number, default: 0 },
    completeCount: { type: Number, default: 0 },
    rewatchCount: { type: Number, default: 0 },
    watchMsTotal: { type: Number, default: 0 },
  },
  { timestamps: true } // ✅ createdAt/updatedAt
);

postSchema.index({ geo: "2dsphere" });
postSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Post", postSchema);
