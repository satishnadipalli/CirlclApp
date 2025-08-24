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

    // Generate up to three suggestion options
    const base = prompt.text || "Share something about your day."
    const pool = [
      base,
      "Capture a moment that made you smile today.",
      "What’s one tiny win you had today?",
      "Share something you learned today.",
      "A sound, sight, or smell that stood out today.",
    ]
    const dedup = []
    for (const p of pool) { if (!dedup.includes(p)) dedup.push(p) }
    const options = dedup.slice(0, 3).map((t) => ({ text: t }))

    res.json({ success: true, prompt, posted, options })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

const postTodayEntry = async (req, res) => {
  try {
    let { text = "", visibility = "followers" } = req.body
    if (!["followers", "everyone", "group", "closeFriends"].includes(String(visibility))) visibility = "followers"
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
      { $setOnInsert: { user: userId, current: 0, longest: 0, lastPostedDateKey: null, latePasses: 1 } },
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

    // Followers-only and close-friends visibility support
    const me = await User.findById(userId).select('following closeFriends blockedUsers')
    const followingIds = (me?.following || []).map((id) => String(id))
    const cfIds = new Set((me?.closeFriends || []).map((id) => String(id)))
    const blockedIds = new Set((me?.blockedUsers || []).map((id) => String(id)))

    const filter = {
      dateKey,
      $or: [
        { visibility: "everyone" },
        { visibility: "followers", user: { $in: [...followingIds, String(userId)] } },
        { visibility: "closeFriends", user: { $in: [...followingIds, String(userId)] } },
      ],
      user: { $nin: Array.from(blockedIds) },
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
    const current = Number(streak.current || 0)
    const milestones = [3, 7, 14, 21, 30, 50, 75, 100]
    const nextMilestone = milestones.find((m) => m > current) || null
    const hitMilestone = milestones.includes(current)
    res.json({ success: true, streak: { ...streak.toObject?.() || streak, nextMilestone, hitMilestone } })
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

    // Block safety: don't return content if requestor has blocked target
    const me = await User.findById(requestorId).select('blockedUsers')
    if ((me?.blockedUsers || []).some((id) => String(id) === String(userId))) {
      return res.status(404).json({ success: false, message: 'No entry' })
    }

    // Fetch entries for the day (multiple allowed)
    const entries = await DailyCircleEntry.find({ user: userId, dateKey, group: { $exists: false } })
      .sort({ createdAt: -1 })
      .populate('user', 'name profilePic')

    if (!entries || entries.length === 0) return res.status(404).json({ success: false, message: 'No entry' })

    // If viewing someone else's entries and they're not public, require unlock OR close-friends membership
    const isOwn = requestorId === String(userId)
    const anyPublic = entries.some((e) => String(e.visibility) === 'everyone')
    if (!isOwn && !anyPublic) {
      const posted = await DailyCircleEntry.exists({ user: requestorId, dateKey, group: { $exists: false } })
      if (!posted) return res.status(403).json({ success: false, message: 'Post today to unlock your Daily Circle' })
    }

    // Filter out closeFriends entries if requestor is not in owner's closeFriends
    if (!isOwn) {
      const owner = await User.findById(userId).select('closeFriends')
      const isCF = (owner?.closeFriends || []).some((id) => String(id) === requestorId)
      if (!isCF) {
        // Return only non-closeFriends entries
        const filtered = entries.filter((e) => String(e.visibility) !== 'closeFriends')
        return res.json({ success: true, entry: filtered[0] || null, entries: filtered })
      }
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

    const me = await User.findById(userId).select('blockedUsers')
    const blockedIds = new Set((me?.blockedUsers || []).map((id) => String(id)))

    const entries = await DailyCircleEntry.find({ dateKey, group: groupId })
      .sort({ createdAt: -1 })
      .where('user').nin(Array.from(blockedIds))
      .populate('user', 'name profilePic')

    res.json({ success: true, entries })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Auto-generate captions using AssemblyAI (requires ASSEMBLYAI_API_KEY)
const autoCaptions = async (req, res) => {
  try {
    const { entryId } = req.params
    if (!entryId) return res.status(400).json({ success: false, message: 'entryId required' })

    const entry = await DailyCircleEntry.findById(entryId).select('user mediaUrl')
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' })
    if (String(entry.user) !== String(req.user._id)) return res.status(403).json({ success: false, message: 'Forbidden' })

    const mediaUrl = entry.mediaUrl || ''
    const isAudioVideo = /\.(mp3|m4a|wav|aac|flac|ogg|mp4|mov|m4v|webm)$/i.test(mediaUrl)
    if (!isAudioVideo) return res.status(400).json({ success: false, message: 'Media must be audio/video for auto-captions' })

    const apiKey = process.env.ASSEMBLYAI_API_KEY
    if (!apiKey) return res.status(501).json({ success: false, message: 'ASR not configured. Set ASSEMBLYAI_API_KEY.' })

    // Create transcription job
    const createResp = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: { 'authorization': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ audio_url: mediaUrl, speaker_labels: false, punctuate: true, format_text: true })
    })
    if (!createResp.ok) {
      const t = await createResp.text().catch(() => '')
      return res.status(502).json({ success: false, message: 'Failed to create transcription job', details: t })
    }
    const createData = await createResp.json()
    const jobId = createData.id
    if (!jobId) return res.status(502).json({ success: false, message: 'No transcription id returned' })

    // Poll for completion (up to ~30s)
    let result = null
    for (let i = 0; i < 12; i++) {
      await sleep(2500)
      const jobResp = await fetch(`https://api.assemblyai.com/v2/transcript/${jobId}`, {
        headers: { 'authorization': apiKey }
      })
      if (!jobResp.ok) continue
      const job = await jobResp.json()
      if (job.status === 'completed') { result = job; break }
      if (job.status === 'error') return res.status(502).json({ success: false, message: job.error || 'Transcription failed' })
    }

    if (!result) return res.status(202).json({ success: false, message: 'Transcription in progress, try again shortly' })

    // Build caption segments from words (fallback to text)
    const words = Array.isArray(result.words) ? result.words : []
    let segments = []
    if (words.length > 0) {
      const segmentMs = 3500
      let curStart = words[0].start || 0
      let curEnd = curStart
      let buf = []
      for (const w of words) {
        const wStart = Number(w.start || 0)
        const wEnd = Number(w.end || wStart)
        if ((wEnd - curStart) > segmentMs) {
          segments.push({ start: Math.max(0, curStart) / 1000, end: Math.max(curStart, curEnd) / 1000, text: buf.join(' ').trim() })
          buf = []
          curStart = wStart
        }
        buf.push(String(w.text || w.text?.content || ''))
        curEnd = wEnd
      }
      if (buf.length > 0) segments.push({ start: Math.max(0, curStart) / 1000, end: Math.max(curStart, curEnd) / 1000, text: buf.join(' ').trim() })
      segments = segments.filter((s) => s.text)
    } else if (typeof result.text === 'string' && result.text.trim().length > 0) {
      const t = result.text.trim()
      const chunks = t.match(/(?:[^.!?\n]+[.!?]?)/g) || [t]
      let time = 0
      segments = chunks.map((c) => {
        const len = Math.min(4, Math.max(1.5, c.split(/\s+/).length / 2)) // rough seconds estimate
        const s = { start: time, end: time + len, text: c.trim() }
        time += len
        return s
      })
    } else {
      return res.status(204).json({ success: false, message: 'No transcribed content' })
    }

    // Save to entry
    const norm = segments
      .map((c) => ({ start: Math.max(0, Number(c.start) || 0), end: Math.max(0, Number(c.end) || 0), text: String(c.text || '') }))
      .filter((c) => c.text)
      .sort((a, b) => a.start - b.start)

    await DailyCircleEntry.findByIdAndUpdate(entryId, { $set: { captions: norm } })

    res.json({ success: true, captions: norm })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

// Increment view for an entry (id in body)
const incrementView = async (req, res) => {
  try {
    const { entryId } = req.body
    if (!entryId) return res.status(400).json({ success: false, message: 'entryId required' })
    const userId = String(req.user._id)
    const { Types } = require('mongoose')
    const userObjId = new Types.ObjectId(userId)

    // Atomic, idempotent per user: only append if not present; then recompute viewsCount from array size
    const updated = await DailyCircleEntry.findByIdAndUpdate(
      entryId,
      [
        {
          $set: {
            views: {
              $cond: [
                { $or: [ { $in: [userObjId, "$views"] }, { $in: [userId, "$views"] } ] },
                "$views",
                { $concatArrays: ["$views", [userObjId]] }
              ]
            }
          }
        },
        { $set: { viewsCount: { $size: "$views" } } }
      ],
      { new: true }
    )

    res.json({ success: true, viewsCount: updated?.viewsCount || 0 })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

// React to an entry
const reactToEntry = async (req, res) => {
  try {
    const { entryId, type } = req.body
    const userId = String(req.user._id)
    if (!entryId) return res.status(400).json({ success: false, message: 'entryId and type required' })

    const entry = await DailyCircleEntry.findById(entryId).select('reactions')
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' })

    const now = new Date()
    const idx = (entry.reactions || []).findIndex((r) => String(r.user) === userId)

    let myReaction = null
    if (!type) {
      // If no type provided, treat as remove
      if (idx !== -1) entry.reactions.splice(idx, 1)
      myReaction = null
    } else if (idx === -1) {
      // New reaction
      entry.reactions.push({ user: req.user._id, type, at: now })
      myReaction = type
    } else if (entry.reactions[idx]?.type === type) {
      // Toggle off same reaction
      entry.reactions.splice(idx, 1)
      myReaction = null
    } else {
      // Switch reaction type
      entry.reactions[idx].type = type
      entry.reactions[idx].at = now
      myReaction = type
    }

    await entry.save()

    const counts = (entry.reactions || []).reduce((acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1
      return acc
    }, {})

    res.json({ success: true, myReaction, counts })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

// Highlights: store user/entry ids in a simple array on the user document (fallback)
const toggleHighlight = async (req, res) => {
  try {
    const { entryId, on } = req.body
    if (!entryId) return res.status(400).json({ success: false, message: 'entryId required' })
    const userId = String(req.user._id)
    // Lightweight: keep highlights on User as array of DailyCircleEntry ids
    const UserModel = require('../models/user.models')
    const user = await UserModel.findById(userId).select('highlights')
    if (!user.highlights) user.highlights = []
    const idx = user.highlights.findIndex((x) => String(x) === String(entryId))
    if (on === false && idx !== -1) user.highlights.splice(idx, 1)
    else if (on !== false && idx === -1) user.highlights.push(entryId)
    await user.save()
    res.json({ success: true, highlights: user.highlights })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

const getHighlights = async (req, res) => {
  try {
    const userId = String(req.user._id)
    const UserModel = require('../models/user.models')
    const me = await UserModel.findById(userId).select('highlights')
    const ids = (me?.highlights || []).map((id) => String(id))

    if (!ids.length) return res.json({ success: true, entries: [] })

    const entries = await DailyCircleEntry.find({ _id: { $in: ids } })
      .sort({ createdAt: -1 })
      .populate('user', 'name profilePic')

    // Clean up stale references to expired/removed entries
    const foundIds = new Set(entries.map((e) => String(e._id)))
    if (me && ids.some((id) => !foundIds.has(id))) {
      me.highlights = (me.highlights || []).filter((id) => foundIds.has(String(id)))
      await me.save()
    }

    res.json({ success: true, entries })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

// Reactions summary for an entry
const getReactionsSummary = async (req, res) => {
  try {
    const { entryId } = req.params
    if (!entryId) return res.status(400).json({ success: false, message: 'entryId required' })
    const userId = String(req.user._id)
    const entry = await DailyCircleEntry.findById(entryId).select('reactions')
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' })
    const counts = (entry.reactions || []).reduce((acc, r) => {
      if (!r?.type) return acc
      acc[r.type] = (acc[r.type] || 0) + 1
      return acc
    }, {})
    const my = (entry.reactions || []).find((r) => String(r.user) === userId)?.type || null
    res.json({ success: true, counts, myReaction: my })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

// List reactors for an entry (optionally filter by type)
const listReactors = async (req, res) => {
  try {
    const { entryId } = req.params
    const { type } = req.query
    let page = Number.parseInt(req.query.page) || 1
    let limit = Number.parseInt(req.query.limit) || 30
    if (limit > 100) limit = 100
    if (limit < 1) limit = 30
    if (!entryId) return res.status(400).json({ success: false, message: 'entryId required' })
    const entry = await DailyCircleEntry.findById(entryId).select('reactions')
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' })

    let list = Array.isArray(entry.reactions) ? entry.reactions : []
    if (type) list = list.filter((r) => String(r.type) === String(type))
    const total = list.length
    const start = (page - 1) * limit
    const end = start + limit
    const slice = list.slice(start, end)
    const userIds = slice.map((r) => r.user)
    const users = await require('../models/user.models').find({ _id: { $in: userIds } }).select('_id name profilePic')
    const usersById = new Map(users.map((u) => [String(u._id), u]))
    const reactors = slice.map((r) => ({ user: usersById.get(String(r.user)) || { _id: r.user }, type: r.type, at: r.at }))
    res.json({ success: true, page, pages: Math.ceil(total / limit), total, reactors })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

// Captions
const getCaptions = async (req, res) => {
  try {
    const { entryId } = req.params
    const entry = await DailyCircleEntry.findById(entryId).select('captions')
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' })
    res.json({ success: true, captions: entry.captions || [] })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
}

const putCaptions = async (req, res) => {
  try {
    const { entryId } = req.params
    const { captions } = req.body
    if (!Array.isArray(captions)) return res.status(400).json({ success: false, message: 'captions array required' })
    // Only the owner can update (simple check)
    const entry = await DailyCircleEntry.findById(entryId).select('user')
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' })
    if (String(entry.user) !== String(req.user._id)) return res.status(403).json({ success: false, message: 'Forbidden' })
    const norm = captions
      .map((c) => ({ start: Math.max(0, Number(c.start) || 0), end: Math.max(0, Number(c.end) || 0), text: String(c.text || '') }))
      .filter((c) => c.text)
      .sort((a, b) => a.start - b.start)
    const updated = await DailyCircleEntry.findByIdAndUpdate(entryId, { $set: { captions: norm } }, { new: true }).select('captions')
    res.json({ success: true, captions: updated?.captions || [] })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
}

module.exports = { getTodayPrompt, postTodayEntry, getTodayFeed, getMyStreak }
module.exports.getRings = getRings
module.exports.getEntryByUser = getEntryByUser
module.exports.getGroupDailyFeed = getGroupDailyFeed
module.exports.incrementView = incrementView
module.exports.reactToEntry = reactToEntry
module.exports.toggleHighlight = toggleHighlight
module.exports.getHighlights = getHighlights
module.exports.getReactionsSummary = getReactionsSummary
module.exports.listReactors = listReactors
module.exports.getCaptions = getCaptions
module.exports.putCaptions = putCaptions
module.exports.autoCaptions = autoCaptions

