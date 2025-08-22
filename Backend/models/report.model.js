const mongoose = require("mongoose")

const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    targetType: { type: String, enum: ["entry", "user", "message", "post"], required: true },
    targetId: { type: String, required: true },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reason: { type: String, enum: ["spam", "abuse", "nudity", "violence", "other"], required: true },
    details: { type: String, default: "" },
    status: { type: String, enum: ["open", "reviewed"], default: "open" },
  },
  { timestamps: true },
)

reportSchema.index({ targetType: 1, targetId: 1 })

module.exports = mongoose.model("Report", reportSchema)