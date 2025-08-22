const DailyPrompt = require("../models/dailyPrompt.model")
const DailyCircleEntry = require("../models/dailyCircleEntry.model")
const DailyStreak = require("../models/dailyStreak.model")
const User = require("../models/user.models")
const Group = require("../models/group.model")

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
      const existing = await DailyCircleEntry.exists({ user: req.user._id, dateKey })
      posted = !!existing
    }

    res.json({ success: true, prompt, posted })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

const postTodayEntry = async (req, res) => {
  try {
    let { text = "", visibility = "followers" } = req.body
    if (!["followers", "everyone", "group"].includes(String(visibility))) visibility = "followers"
    // Multer + Cloudinary sets req.file.path to the uploaded asset URL
    const mediaUrl = (req.file && req.file.path) || req.fileUrl || req.body.mediaUrl || ""
    const userId = req.user._id
    const dateKey = formatDateKey(new Date())
    const groupId = req.body?.group || null

    if (visibility === 'group' && groupId) {
      const grp = await Group.findById(groupId)
      if (!grp) return res.status(404).json({ success: false, message: 'Group not found' })
      if (!grp.members.some((m) => String(m) === String(userId))) return res.status(403).json({ success: false, message: 'Not a member of this group' })
    }

    const entry = await DailyCircleEntry.create({ user: userId, dateKey, mediaUrl, text, visibility, ...(groupId ? { group: groupId } : {}) })

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
      if (streak.lastPostedDateKey === yKey) streak.current += 1
      else streak.current = 1
      if (streak.current > streak.longest) streak.longest = streak.current
      streak.lastPostedDateKey = dateKey
      await streak.save()
    }

    // Socket notify self + followers (best-effort)
    try {
      const io = req.app.get("io")
      const onlineUsers = req.app.get("onlineUsers")

      // Notify self with updated streak
      const selfSocketId = onlineUsers.get(String(userId))
      if (selfSocketId) io.to(selfSocketId).emit("dailyPosted", { userId, dateKey, streak: streak?.current || 0 })

      // Notify followers to update rings if online (only non-group)
      if (!groupId) {
        const me = await User.findById(userId).select("name profilePic followers")
        const ringPayload = {
          user: { _id: String(userId), name: me?.name || "User", profilePic: me?.profilePic || "" },
          createdAt: entry.createdAt,
        }
        for (const followerId of me?.followers || []) {
          const followerSocketId = onlineUsers.get(String(followerId))
          if (followerSocketId) io.to(followerSocketId).emit("dailyRing", ringPayload)
        }
      }
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

    // Followers-only visibility support
    const me = await User.findById(userId).select('following')
    const followingIds = (me?.following || []).map((id) => String(id))

    const filter = {
      dateKey,
      $or: [
        { visibility: "everyone" },
        { visibility: "followers", user: { $in: [...followingIds, String(userId)] } },
      ],
    }

    const total = await DailyCircleEntry.countDocuments(filter)
    const entries = await DailyCircleEntry.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name profilePic')

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

const getRings = async (req, res) => {
  try {
    const userId = req.user._id
    const dateKey = formatDateKey(new Date())
    // Require requester to have posted to see rings (server-side gating)
    const requesterPosted = await DailyCircleEntry.exists({ user: userId, dateKey, group: { $exists: false } })
    if (!requesterPosted) return res.json({ success: true, rings: [] })

    const me = await User.findById(userId).select('following')
    const followingIds = (me?.following || []).map((id) => String(id))
    if (followingIds.length === 0) return res.json({ success: true, rings: [] })

    // dedupe to latest per user
    const entries = await DailyCircleEntry.aggregate([
      { $match: { dateKey, user: { $in: followingIds.map((id) => new (require('mongoose')).Types.ObjectId(id)) }, group: { $exists: false } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$user", latest: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$latest" } },
    ])

    const populated = await DailyCircleEntry.populate(entries, { path: 'user', select: 'name profilePic' })

    const rings = populated.map((e) => ({
      user: e.user,
      createdAt: e.createdAt,
    }))
    res.json({ success: true, rings })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

const getEntryByUser = async (req, res) => {
  try {
    const requestorId = String(req.user._id)
    const { userId } = req.params
    const dateKey = formatDateKey(new Date())

    // Fetch entries for the day (multiple allowed)
    const entries = await DailyCircleEntry.find({ user: userId, dateKey, group: { $exists: false } })
      .sort({ createdAt: -1 })
      .populate('user', 'name profilePic')

    if (!entries || entries.length === 0) return res.status(404).json({ success: false, message: 'No entry' })

    // If viewing someone else's entries and they're not public, require unlock
    const isOwn = requestorId === String(userId)
    const anyPublic = entries.some((e) => String(e.visibility) === 'everyone')
    if (!isOwn && !anyPublic) {
      const posted = await DailyCircleEntry.exists({ user: requestorId, dateKey, group: { $exists: false } })
      if (!posted) return res.status(403).json({ success: false, message: 'Post today to unlock your Daily Circle' })
    }

    res.json({ success: true, entry: entries[0] || null, entries })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

const getGroupDailyFeed = async (req, res) => {
  try {
    const { groupId } = req.params
    const userId = String(req.user._id)
    const dateKey = formatDateKey(new Date())

    const grp = await Group.findById(groupId).select('members')
    if (!grp) return res.status(404).json({ success: false, message: 'Group not found' })
    if (!grp.members.some((m) => String(m) === userId)) return res.status(403).json({ success: false, message: 'Not a member' })

    const entries = await DailyCircleEntry.find({ dateKey, group: groupId })
      .sort({ createdAt: -1 })
      .populate('user', 'name profilePic')

    res.json({ success: true, entries })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

module.exports = { getTodayPrompt, postTodayEntry, getTodayFeed, getMyStreak }
module.exports.getRings = getRings
module.exports.getEntryByUser = getEntryByUser
module.exports.getGroupDailyFeed = getGroupDailyFeed

