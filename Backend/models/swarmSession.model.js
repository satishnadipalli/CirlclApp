const mongoose = require("mongoose")

const swarmIdeaSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true, maxlength: 500 },
    votes: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

const swarmVoteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ideaId: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { _id: false }
)

const swarmClusterSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    ideaIds: [{ type: mongoose.Schema.Types.ObjectId }],
  },
  { _id: true }
)

const swarmActionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 200 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    dueAt: { type: Date },
  },
  { _id: true }
)

const swarmSessionSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    prompt: { type: String, required: true, trim: true, maxlength: 300 },
    status: { type: String, enum: ["lobby", "active", "ended"], default: "lobby" },
    invited: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    ideas: [swarmIdeaSchema],
    clusters: [swarmClusterSchema],
    votes: [swarmVoteSchema],
    actions: [swarmActionSchema],
    lastPhase: { type: String, enum: ["lobby", "diverge", "cluster", "vote", "converge", "ended"], default: "lobby" },
    startedAt: { type: Date },
    endsAt: { type: Date },
    settings: {
      durationMinutes: { type: Number, default: 15, min: 5, max: 60 },
    },
  },
  { timestamps: true }
)

swarmSessionSchema.index({ group: 1, createdAt: -1 })
swarmSessionSchema.index({ group: 1, status: 1, updatedAt: -1 })

module.exports = mongoose.model("SwarmSession", swarmSessionSchema)

