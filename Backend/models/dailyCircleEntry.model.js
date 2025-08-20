const mongoose = require("mongoose")

const dailyCircleEntrySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group" }, // optional group-specific entry
    dateKey: { type: String, required: true }, // YYYY-MM-DD UTC
    mediaUrl: { type: String },
    text: { type: String, default: "" },
    visibility: { type: String, enum: ["followers", "everyone", "group"], default: "followers" },
  },
  { timestamps: true },
)

dailyCircleEntrySchema.index({ user: 1, dateKey: 1, group: 1 }, { unique: true, partialFilterExpression: { group: { $exists: true } } })
dailyCircleEntrySchema.index({ user: 1, dateKey: 1 }, { unique: true, partialFilterExpression: { group: { $exists: false } } })
// Auto-expire entries after 24 hours to keep Daily Circle ephemeral
dailyCircleEntrySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 })

module.exports = mongoose.model("DailyCircleEntry", dailyCircleEntrySchema)

