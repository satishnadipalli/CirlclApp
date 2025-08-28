const mongoose = require("mongoose")

const messageSchema = new mongoose.Schema(
  {
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // For direct messages
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // For group messages
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
    },
    text: {
      type: String,
      default: "",
      trim: true,
    },
    messageType: {
      type: String,
      enum: ["direct", "group"],
      required: true,
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    // For group read tracking
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Attachments (images/videos/files)
    attachments: [
      {
        url: { type: String, required: true },
        type: { type: String, enum: ["image", "video", "file", "audio"], default: "image" },
        name: { type: String, default: "" },
        size: { type: Number, default: 0 },
        width: { type: Number, default: 0 },
        height: { type: Number, default: 0 },
        duration: { type: Number, default: 0 },
      },
    ],
    reactions: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        type: { type: String, default: '' },
        at: { type: Date, default: Date.now },
      },
    ],
    // Stars and pinning
    starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    pinnedAt: { type: Date },
    // Poll (optional)
    poll: new mongoose.Schema({
      question: { type: String, default: '' },
      options: [
        new mongoose.Schema({
          id: { type: String, required: true },
          text: { type: String, required: true },
          votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        }, { _id: false })
      ],
      allowMultiple: { type: Boolean, default: false },
      allowChange: { type: Boolean, default: true },
      endsAt: { type: Date },
    }, { _id: false }),
    linkPreview: new mongoose.Schema({
      url: { type: String, default: '' },
      title: { type: String, default: '' },
      description: { type: String, default: '' },
      image: { type: String, default: '' },
      siteName: { type: String, default: '' },
    }, { _id: false }),
    // Ephemeral TTL
    expiresAt: { type: Date },
    burnAfterReadSeconds: { type: Number, default: null },
    // Delivery tracking (per-recipient)
    deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    deliveredAt: { type: Date },
  },
  { timestamps: true },
)

messageSchema.index({ messageType: 1, to: 1, createdAt: -1 })
messageSchema.index({ messageType: 1, group: 1, createdAt: -1 })
// Enable efficient text search for message content
try {
  messageSchema.index({ text: 'text' })
} catch {}
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// Validation: message must have either 'to' or 'group', not both
messageSchema.pre("save", function (next) {
  if (this.messageType === "direct" && !this.to) {
    return next(new Error("Direct message must have a recipient"))
  }
  if (this.messageType === "group" && !this.group) {
    return next(new Error("Group message must have a group"))
  }
  if (this.to && this.group) {
    return next(new Error("Message cannot be both direct and group"))
  }
  next()
})

module.exports = mongoose.model("Message", messageSchema)