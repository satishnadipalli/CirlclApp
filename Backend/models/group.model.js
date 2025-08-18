const mongoose = require("mongoose")

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    description: {
      type: String,
      default: "",
      maxlength: 200,
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    admins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    groupPic: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
)

// Ensure creator is always an admin
groupSchema.pre("save", function (next) {
  if (!this.admins.includes(this.creator)) {
    this.admins.push(this.creator)
  }
  if (!this.members.includes(this.creator)) {
    this.members.push(this.creator)
  }
  next()
})

module.exports = mongoose.model("Group", groupSchema)
