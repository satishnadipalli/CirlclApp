const mongoose = require("mongoose")

const dailyPromptSchema = new mongoose.Schema(
  {
    dateKey: { type: String, required: true, unique: true }, // YYYY-MM-DD (UTC)
    text: { type: String, required: true },
    dropsAt: { type: Date, required: true },
  },
  { timestamps: true },
)

dailyPromptSchema.index({ dateKey: 1 }, { unique: true })

module.exports = mongoose.model("DailyPrompt", dailyPromptSchema)

