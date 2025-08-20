const DailyPrompt = require("../models/dailyPrompt.model")
const DailyCircleEntry = require("../models/dailyCircleEntry.model")
const DailyStreak = require("../models/dailyStreak.model")
const User = require("../models/user.models")

const formatDateKey = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  .toISOString()
  .slice(0, 10)

const getTodayPrompt = async (req, res) => {
  try {
    const now = new Date()
    const dateKey = formatDateKey(now)
    let prompt = await DailyPrompt.findOne({ dateKey })
    if (!prompt) {
      // Fallback: auto-generate if not present
      prompt = await DailyPrompt.create({
        dateKey,
        text: "Share a small moment you’re grateful for.",
        dropsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 0, 0)),
      })
    }

    // Has user posted today?
    let posted = false
    if (req.user?._id) {
      const existing = await DailyCircleEntry.findOne({ user: req.user._id, dateKey })
      posted = !!existing
    }

    res.json({ success: true, prompt, posted })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

const postTodayEntry = async (req, res) => {
  try {
    const userId = req.user._id
    const { text = "", visibility = "followers" } = req.body
    const mediaUrl = req.fileUrl || req.body.mediaUrl || ""
    const dateKey = formatDateKey(new Date())

    // Enforce single entry per day (global)
    const exists = await DailyCircleEntry.findOne({ user: userId, dateKey, group: { $exists: false } })
    if (exists) return res.status(400).json({ success: false, message: "Already posted today" })

    const entry = await DailyCircleEntry.create({ user: userId, dateKey, mediaUrl, text, visibility })

    // Update streak
    const streak = await DailyStreak.findOneAndUpdate(
      { user: userId },
      {},
      { new: true, upsert: true },
    )
    if (streak.lastPostedDateKey === dateKey) {
      // do nothing
    } else {
      // compute continuity
      const yesterday = new Date(dateKey)
      yesterday.setUTCDate(yesterday.getUTCDate() - 1)
      const yKey = yesterday.toISOString().slice(0, 10)
      if (streak.lastPostedDateKey === yKey) {
        streak.current += 1
      } else {
        streak.current = 1
      }
      if (streak.current > streak.longest) streak.longest = streak.current
      streak.lastPostedDateKey = dateKey
      await streak.save()
    }

    // Socket notify followers (best-effort)
    try {
      const io = req.app.get("io")
      const onlineUsers = req.app.get("onlineUsers")
      // For simplicity, broadcast to online followers could be implemented via graph lookup; here we emit a generic event to self
      const sid = onlineUsers.get(String(userId))
      if (sid) io.to(sid).emit("dailyPosted", { userId, dateKey })
    } catch {}

    res.status(201).json({ success: true, entry })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

const getTodayFeed = async (req, res) => {
  try {
    const userId = req.user._id
    const dateKey = formatDateKey(new Date())
    const posted = await DailyCircleEntry.exists({ user: userId, dateKey, group: { $exists: false } })
    if (!posted) return res.status(403).json({ success: false, message: "Post today to unlock your Daily Circle" })

    let { page = 1, limit = 30 } = req.query
    page = parseInt(page)
    limit = Math.min(60, Math.max(6, parseInt(limit)))

    // Followers-only visibility support: entries visible if
    //   - visibility === 'everyone'
    //   - visibility === 'followers' AND entry.user in my following OR entry.user == me
    const me = await User.findById(userId).select("following")
    const followingIds = (me?.following || []).map((id) => String(id))

    const filter = {
      dateKey,
      $or: [
        { visibility: "everyone" },
        { visibility: "followers", user: { $in: [...followingIds, String(userId)] } },
      ],
      $orIgnoreGroup: {},
    }

    // Because Mongo cannot have unused keys, we ensure no group field in filter using $exists
    const finalFilter = { dateKey, group: { $exists: false }, $or: filter.$or }

    const total = await DailyCircleEntry.countDocuments(finalFilter)
    const entries = await DailyCircleEntry.find(finalFilter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("user", "name profilePic")

    res.json({ success: true, page, total, pages: Math.ceil(total / limit), entries })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

const getMyStreak = async (req, res) => {
  try {
    const userId = req.user._id
    const streak = (await DailyStreak.findOne({ user: userId })) || { current: 0, longest: 0, latePasses: 1 }
    res.json({ success: true, streak })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

module.exports = { getTodayPrompt, postTodayEntry, getTodayFeed, getMyStreak }

