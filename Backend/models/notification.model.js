// models/Notification.js
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["like", "comment", "reply", "follow", "mention", "save", "swarm_invite"],
      required: true
    },
    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post" }, 
    comment: { type: mongoose.Schema.Types.ObjectId }, 
    reply: { type: mongoose.Schema.Types.ObjectId }, 
    text: String, 
    isRead: { type: Boolean, default: false },
    actionLink: { type: String } // NEW: frontend can use this to navigate
  },
  { timestamps: true }
);

notificationSchema.index({ receiver: 1, createdAt: -1 })
notificationSchema.index({ receiver: 1, isRead: 1 })

module.exports = mongoose.model("Notification", notificationSchema);
