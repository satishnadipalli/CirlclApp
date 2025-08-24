const mongoose = require("mongoose")

const dailyStreakSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    current: { type: Number, default: 0 },
    longest: { type: Number, default: 0 },
    lastPostedDateKey: { type: String, default: null }, // YYYY-MM-DD
    latePasses: { type: Number, default: 1 },
    // New: track forgiven dates and weekly usage
    forgivenForDateKeys: [{ type: String }],
    lastLatePassAt: { type: Date, default: null },
  },
  { timestamps: true },
)

module.exports = mongoose.model("DailyStreak", dailyStreakSchema)

