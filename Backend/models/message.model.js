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
      required: true,
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
  },
  { timestamps: true },
)

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