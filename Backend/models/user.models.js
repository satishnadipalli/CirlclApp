const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, default: "" },
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
  expoPushTokens: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
