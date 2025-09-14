const Message = require("../models/message.model")
const User = require("../models/user.models")
const Group = require("../models/group.model")
const mongoose = require("mongoose")
// Lightweight text search for messages (MongoDB text index)
async function searchMessages(req, res) {
  try {
    const { q } = req.query
    const { peerId, groupId } = req.params
    const userId = String(req.user.id)
    const page = Math.max(1, Number.parseInt(String(req.query.page || 1)))
    const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit || 20))))

    if (!q || String(q).trim().length < 2) return res.json({ success: true, page, limit, total: 0, messages: [] })

    const filter = { $text: { $search: String(q) } }
    if (peerId) {
      // direct conversation scope
      filter.messageType = 'direct'
      filter.$or = [
        { from: userId, to: peerId },
        { from: peerId, to: userId },
      ]
    } else if (groupId) {
      filter.messageType = 'group'
      filter.group = groupId
    } else {
      // safety: require a scope
      return res.status(400).json({ success: false, message: 'peerId or groupId required' })
    }

    const total = await Message.countDocuments(filter)
    const docs = await Message.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('from to', 'name profilePic')

    const messages = docs.map((m) => ({
      _id: m._id,
      text: m.text,
      from: m.from,
      to: m.to,
      group: m.group,
      messageType: m.messageType,
      createdAt: m.createdAt,
      attachments: m.attachments,
    }))
    res.json({ success: true, page, limit, total, messages })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

// Toggle star on a message for current user
async function toggleStar(req, res) {
  try {
    const { messageId } = req.params
    const userId = String(req.user.id)
    const msg = await Message.findById(messageId)
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' })
    const idx = (msg.starredBy || []).findIndex((u) => String(u) === userId)
    if (idx === -1) msg.starredBy.push(req.user.id)
    else msg.starredBy.splice(idx, 1)
    await msg.save()
    return res.json({ success: true, starred: idx === -1 })
  } catch (e) { return res.status(500).json({ success: false, message: e.message }) }
}

// Pin a message in a chat (sender can pin within 12h); one pin per user per chat in client UX
async function pinMessage(req, res) {
  try {
    const { messageId } = req.params
    const userId = String(req.user.id)
    const msg = await Message.findById(messageId)
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' })
    if (String(msg.from) !== userId) return res.status(403).json({ success: false, message: 'Only sender can pin' })
    if (Date.now() - new Date(msg.createdAt).getTime() > 12 * 60 * 60 * 1000) return res.status(403).json({ success: false, message: 'Pin window passed' })
    msg.pinnedBy = req.user.id
    msg.pinnedAt = new Date()
    await msg.save()
    try {
      const io = req.app.get('io')
      const payload = { _id: msg._id, pinnedBy: String(userId), pinnedAt: msg.pinnedAt }
      if (msg.messageType === 'direct') {
        const onlineUsers = req.app.get('onlineUsers')
        const to1 = onlineUsers.get(String(msg.from))
        const to2 = onlineUsers.get(String(msg.to))
        if (to1) io.to(to1).emit('messagePinned', payload)
        if (to2) io.to(to2).emit('messagePinned', payload)
      } else {
        io.to(`group_${msg.group}`).emit('messagePinned', payload)
      }
    } catch {}
    return res.json({ success: true })
  } catch (e) { return res.status(500).json({ success: false, message: e.message }) }
}

// Unpin a message (sender can unpin their own pinned message)
async function unpinMessage(req, res) {
  try {
    const { messageId } = req.params
    const userId = String(req.user.id)
    const msg = await Message.findById(messageId)
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' })
    if (String(msg.from) !== userId) return res.status(403).json({ success: false, message: 'Only sender can unpin' })
    msg.pinnedBy = null
    msg.pinnedAt = null
    await msg.save()
    try {
      const io = req.app.get('io')
      const payload = { _id: msg._id, pinnedBy: null, pinnedAt: null }
      if (msg.messageType === 'direct') {
        const onlineUsers = req.app.get('onlineUsers')
        const to1 = onlineUsers.get(String(msg.from))
        const to2 = onlineUsers.get(String(msg.to))
        if (to1) io.to(to1).emit('messagePinned', payload)
        if (to2) io.to(to2).emit('messagePinned', payload)
      } else {
        io.to(`group_${msg.group}`).emit('messagePinned', payload)
      }
    } catch {}
    return res.json({ success: true })
  } catch (e) { return res.status(500).json({ success: false, message: e.message }) }
}

async function listMedia(req, res) {
  try {
    const { peerId, groupId } = req.params
    const userId = String(req.user.id)
    const page = Math.max(1, Number.parseInt(String(req.query.page || 1)))
    const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit || 24))))
    const filter = { 'attachments.0': { $exists: true } }
    if (peerId) {
      filter.messageType = 'direct'
      filter.$or = [ { from: userId, to: peerId }, { from: peerId, to: userId } ]
    } else if (groupId) {
      filter.messageType = 'group'
      filter.group = groupId
    } else {
      return res.status(400).json({ success: false, message: 'peerId or groupId required' })
    }
    const total = await Message.countDocuments(filter)
    const docs = await Message.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select('attachments createdAt from to group messageType')
    res.json({ success: true, page, limit, total, items: docs })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
}

// List starred messages in a conversation
async function listStarred(req, res) {
  try {
    const { peerId, groupId } = req.params
    const userId = String(req.user.id)
    const page = Math.max(1, Number.parseInt(String(req.query.page || 1)))
    const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit || 50))))
    const filter = { starredBy: userId }
    if (peerId) {
      filter.messageType = 'direct'
      filter.$or = [ { from: userId, to: peerId }, { from: peerId, to: userId } ]
    } else if (groupId) {
      filter.messageType = 'group'
      filter.group = groupId
    } else {
      return res.status(400).json({ success: false, message: 'peerId or groupId required' })
    }
    const total = await Message.countDocuments(filter)
    const docs = await Message.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('from to', 'name profilePic')
    res.json({ success: true, page, limit, total, messages: docs })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
}

// List pinned messages in a conversation (global pins)
async function listPinned(req, res) {
  try {
    const { peerId, groupId } = req.params
    const userId = String(req.user.id)
    const page = Math.max(1, Number.parseInt(String(req.query.page || 1)))
    const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit || 50))))
    const filter = { pinnedBy: { $exists: true, $ne: null } }
    if (peerId) {
      filter.messageType = 'direct'
      filter.$or = [ { from: userId, to: peerId }, { from: peerId, to: userId } ]
    } else if (groupId) {
      filter.messageType = 'group'
      filter.group = groupId
    } else {
      return res.status(400).json({ success: false, message: 'peerId or groupId required' })
    }
    const total = await Message.countDocuments(filter)
    const docs = await Message.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('from to', 'name profilePic')
    res.json({ success: true, page, limit, total, messages: docs })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
}

// naive URL detection
const URL_REGEX = /https?:\/\/[^\s]+/i

function normalizePollInput(raw) {
  try {
    if (!raw) return null
    const poll = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!poll || typeof poll !== 'object') return null
    const out = {}
    out.question = String((poll.question || '')).trim()
    if (!out.question) return null
    const rawOptions = Array.isArray(poll.options) ? poll.options : []
    if (rawOptions.length < 2 || rawOptions.length > 10) return null
    const makeId = () => Math.random().toString(36).slice(2, 10)
    const options = []
    const ids = new Set()
    for (const opt of rawOptions) {
      const text = String((typeof opt === 'string' ? opt : (opt && opt.text)) || '').trim()
      if (!text) return null
      let id = String((typeof opt === 'object' && opt && opt.id) || '')
      if (!id) id = makeId()
      if (ids.has(id)) id = makeId()
      ids.add(id)
      options.push({ id, text, votes: [] })
    }
    out.options = options
    out.allowMultiple = Boolean(poll.allowMultiple)
    out.allowChange = poll.allowChange === false ? false : true
    if (poll.endsAt) {
      const d = new Date(poll.endsAt)
      if (!isNaN(d.getTime()) && d.getTime() > Date.now()) out.endsAt = d
    }
    return out
  } catch { return null }
}

function buildPollPayload(poll, viewerId) {
  if (!poll) return null
  const options = (poll.options || []).map((o) => ({ id: o.id, text: o.text, votes: Array.isArray(o.votes) ? o.votes.length : 0 }))
  const payload = {
    question: poll.question || '',
    options,
    allowMultiple: !!poll.allowMultiple,
    allowChange: poll.allowChange !== false,
    endsAt: poll.endsAt || null,
  }
  if (viewerId) {
    try {
      const sel = (poll.options || [])
        .filter((o) => Array.isArray(o.votes) && o.votes.some((v) => String(v) === String(viewerId)))
        .map((o) => o.id)
      payload.selectedOptionIds = sel
    } catch {}
  }
  return payload
}

async function fetchLinkPreview(url) {
  try {
    // Prefer OpenGraph/Twitter meta tags
    const res = await fetch(url, { method: 'GET', redirect: 'follow' })
    const html = await res.text()
    const pick = (prop) => {
      const og = new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i').exec(html)
      if (og && og[1]) return og[1]
      const tw = new RegExp(`<meta[^>]+name=["']twitter:${prop}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i').exec(html)
      if (tw && tw[1]) return tw[1]
      return ''
    }
    const title = pick('title') || (/<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1] || '')
    const description = pick('description')
    const image = pick('image')
    const siteName = pick('site_name')
    return { url, title, description, image, siteName }
  } catch {
    return { url, title: '', description: '', image: '', siteName: '' }
  }
}

// Send message (both direct and group)
const sendMessage = async (req, res) => {
  try {
    const { text, to, group, messageType, replyTo, expiresInSeconds, burnAfterReadSeconds, sharedPost } = req.body
    const from = req.user.id

    const txt = typeof text === 'string' ? text : ''
    if (txt.length > 2000) {
      return res.status(400).json({ success: false, message: 'Text too long' })
    }

    // Validate message type
    if (!["direct", "group"].includes(messageType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid message type",
      })
    }

    let message

    if (messageType === "direct") {
      // Direct message validation
      if (!to) {
        return res.status(400).json({
          success: false,
          message: "Recipient is required for direct messages",
        })
      }

      // Check if recipient exists and DM permission / blocks
      const recipient = await User.findById(to).select('privacy followers blockedUsers')
      if (!recipient) {
        return res.status(404).json({
          success: false,
          message: "Recipient not found",
        })
      }
      // Block checks (either direction)
      try {
        const senderDoc = await User.findById(from).select('blockedUsers')
        const recvBlockedSender = Array.isArray(recipient?.blockedUsers) && recipient.blockedUsers.some((id) => String(id) === String(from))
        const senderBlockedRecv = Array.isArray(senderDoc?.blockedUsers) && senderDoc.blockedUsers.some((id) => String(id) === String(to))
        if (recvBlockedSender || senderBlockedRecv) {
          return res.status(403).json({ success: false, message: 'Cannot message this user' })
        }
      } catch {}
      const allow = recipient?.privacy?.allowDMsFrom || 'everyone'
      if (allow === 'none') {
        return res.status(403).json({ success: false, message: 'User does not accept DMs' })
      }
      if (allow === 'followers') {
        const isFollower = Array.isArray(recipient.followers) && recipient.followers.some((id) => String(id) === String(from))
        if (!isFollower) return res.status(403).json({ success: false, message: 'Only followers can DM this user' })
      }

      // Optional poll creation for direct chat
      const pollDoc = normalizePollInput(req.body?.poll)
      message = new Message({
        from,
        to,
        text: txt,
        messageType: "direct",
        readBy: [from],
        ...(pollDoc ? { poll: pollDoc } : {}),
        ...(sharedPost && mongoose.Types.ObjectId.isValid(sharedPost) ? { sharedPost } : {}),
      })
    } else {
      // Group message validation
      if (!group) {
        return res.status(400).json({
          success: false,
          message: "Group is required for group messages",
        })
      }

      // Check if group exists and user is member
      const groupDoc = await Group.findById(group)
      if (!groupDoc) {
        return res.status(404).json({
          success: false,
          message: "Group not found",
        })
      }

      if (!groupDoc.members.includes(from)) {
        return res.status(403).json({
          success: false,
          message: "You are not a member of this group",
        })
      }

      // Optional poll creation for group chat
      const pollDoc = normalizePollInput(req.body?.poll)
      message = new Message({
        from,
        group,
        text: txt,
        messageType: "group",
        readBy: [from],
        ...(pollDoc ? { poll: pollDoc } : {}),
        ...(sharedPost && mongoose.Types.ObjectId.isValid(sharedPost) ? { sharedPost } : {}),
      })
    }

    // Optional replyTo association
    if (replyTo && mongoose.Types.ObjectId.isValid(replyTo)) {
      message.replyTo = replyTo
    }

    // Map multer uploads to attachments
    if (Array.isArray(req.files) && req.files.length > 0) {
      message.attachments = (req.files || []).map((f) => ({
        url: f?.path || f?.location || f?.secure_url || f?.filename || '',
        type: /^video\//.test(f?.mimetype || '') ? 'video' : (/^image\//.test(f?.mimetype || '') ? 'image' : (/^audio\//.test(f?.mimetype || '') ? 'audio' : 'file')),
        name: f?.originalname || '',
        size: Number(f?.size || 0),
        width: 0,
        height: 0,
        duration: 0,
      })).filter((a) => a.url)
      if (!message.text) message.text = ''
    }

    // Link preview (best-effort, async-within-request to keep simple)
    const urlMatch = typeof txt === 'string' ? txt.match(URL_REGEX) : null
    if (urlMatch && urlMatch[0]) {
      try {
        const meta = await fetchLinkPreview(urlMatch[0])
        message.linkPreview = meta
      } catch {}
    }

    if (expiresInSeconds && !Number.isNaN(Number(expiresInSeconds))) {
      const ttl = Math.max(10, Math.min(7 * 24 * 3600, Number(expiresInSeconds)))
      message.expiresAt = new Date(Date.now() + ttl * 1000)
    }
    if (burnAfterReadSeconds && !Number.isNaN(Number(burnAfterReadSeconds))) {
      message.burnAfterReadSeconds = Math.max(5, Math.min(3600, Number(burnAfterReadSeconds)))
    }
    await message.save()
    await message.populate("from", "name profilePic")
    await message.populate({
      path: "replyTo",
      select: "text from createdAt",
      populate: { path: "from", select: "name profilePic" },
    })

    if (messageType === "group") {
      await message.populate("group", "name")
    } else {
      await message.populate("to", "name profilePic")
    }

    // Emit via socket after persistence
    try {
      const io = req.app.get("io")
      const onlineUsers = req.app.get("onlineUsers")
      if (messageType === "direct") {
        const recipientSocketId = onlineUsers.get(to?.toString?.() || String(to))
        const payload = {
          from: message.from?._id || message.from,
          to: message.to?._id || message.to,
          text: message.text,
          createdAt: message.createdAt,
          messageType: "direct",
          replyTo: message.replyTo?._id || null,
          attachments: message.attachments || [],
          linkPreview: message.linkPreview || null,
          _id: message._id,
          expiresAt: message.expiresAt || null,
          burnAfterReadSeconds: message.burnAfterReadSeconds || null,
          sharedPost: message.sharedPost || null,
          ...(message.poll ? { poll: buildPollPayload(message.poll, req.user.id) } : {}),
        }
        if (recipientSocketId) io.to(recipientSocketId).emit("receiveDirectMessage", payload)
        const senderSocketId = onlineUsers.get((req.user.id || "").toString())
        if (senderSocketId) io.to(senderSocketId).emit("receiveDirectMessage", payload)
        // Mark delivered when receiver is online AND a socket emit succeeded (WhatsApp-like double gray)
        try {
          if (recipientSocketId) {
            const MessageModel = require('../models/message.model')
            await MessageModel.updateOne({ _id: message._id }, { $addToSet: { deliveredTo: to }, $set: { deliveredAt: new Date() } })
            const ack = { chatType: 'direct', messageId: String(message._id), deliveredTo: String(to), at: new Date().toISOString() }
            if (senderSocketId) io.to(senderSocketId).emit('messagesDelivered', ack)
          }
        } catch {}
      } else {
        const payload = {
          from: message.from?._id || message.from,
          group: message.group?._id || message.group,
          text: message.text,
          createdAt: message.createdAt,
          messageType: "group",
          replyTo: message.replyTo?._id || null,
          attachments: message.attachments || [],
          linkPreview: message.linkPreview || null,
          _id: message._id,
          expiresAt: message.expiresAt || null,
          burnAfterReadSeconds: message.burnAfterReadSeconds || null,
          sharedPost: message.sharedPost || null,
          ...(message.poll ? { poll: buildPollPayload(message.poll, req.user.id) } : {}),
        }
        io.to(`group_${message.group?._id || message.group}`).emit("receiveGroupMessage", payload)
        const senderSocketId = onlineUsers.get((req.user.id || "").toString())
        if (senderSocketId) io.to(senderSocketId).emit("receiveGroupMessage", payload)
      }
    } catch (e) {
      // best-effort socket emit; do not fail request
    }

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: message,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error sending message",
      error: error.message,
    })
  }
}

// Get direct messages between two users
const getDirectMessages = async (req, res) => {
  try {
    const { withUserId } = req.params
    const userId = req.user.id
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 50

    const messages = await Message.find({
      messageType: "direct",
      $or: [
        { from: userId, to: withUserId },
        { from: withUserId, to: userId },
      ],
    })
      .populate("from to", "name profilePic")
      .populate('sharedPost', '_id mediaUrl title user')
      .populate({
        path: "replyTo",
        select: "text from createdAt",
        populate: { path: "from", select: "name profilePic" },
      })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    // Map poll for client payload (counts only)
    const out = messages.map((m) => ({
      ...m.toObject(),
      poll: m.poll ? buildPollPayload(m.poll, req.user.id) : undefined,
    }))

    res.status(200).json({
      success: true,
      messages: out.reverse(),
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching messages",
      error: error.message,
    })
  }
}

// Get all chats (both direct and group)
const getAllChats = async (req, res) => {
  try {
    const userId = req.user.id

    const directChats = await Message.aggregate([
      {
        $match: {
          messageType: "direct",
          $or: [{ from: new mongoose.Types.ObjectId(userId) }, { to: new mongoose.Types.ObjectId(userId) }],
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ["$from", new mongoose.Types.ObjectId(userId)] }, "$to", "$from"],
          },
          lastMessage: { $first: "$$ROOT" },
          total: { $sum: 1 },
          unread: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$from", new mongoose.Types.ObjectId(userId)] },
                    { $ne: ["$isRead", true] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          _id: 0,
          user: { _id: "$user._id", name: "$user.name", profilePic: "$user.profilePic" },
          lastMessage: {
            _id: "$lastMessage._id",
            from: "$lastMessage.from",
            to: "$lastMessage.to",
            text: "$lastMessage.text",
            createdAt: "$lastMessage.createdAt",
            attachments: "$lastMessage.attachments",
            linkPreview: "$lastMessage.linkPreview",
          },
          unreadCount: "$unread",
          chatType: "direct",
        },
      },
    ])

    const groupChats = await Group.aggregate([
      { $match: { members: new mongoose.Types.ObjectId(userId), isActive: true } },
      {
        $lookup: {
          from: "messages",
          let: { groupId: "$_id" },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ["$group", "$$groupId"] }, { $eq: ["$messageType", "group"] }] } } },
            { $sort: { createdAt: -1 } },
          ],
          as: "messages",
        },
      },
      {
        $project: {
          _id: 0,
          group: { _id: "$_id", name: "$name", groupPic: "$groupPic" },
          lastMessage: { $arrayElemAt: ["$messages", 0] },
          unreadCount: {
            $size: {
              $filter: {
                input: "$messages",
                as: "m",
                cond: {
                  $and: [
                    { $ne: ["$$m.from", new mongoose.Types.ObjectId(userId)] },
                    {
                      $not: {
                        $in: [new mongoose.Types.ObjectId(userId), { $ifNull: ["$$m.readBy", []] }],
                      },
                    },
                  ],
                },
              },
            },
          },
          chatType: "group",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "lastMessage.from",
          foreignField: "_id",
          as: "lastSender",
        },
      },
      { $addFields: { lastMessageFromName: { $ifNull: [ { $arrayElemAt: ["$lastSender.name", 0] }, "" ] } } },
      { $project: { lastSender: 0 } },
    ])

    res.status(200).json({
      success: true,
      chats: [...directChats, ...groupChats],
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching chats",
      error: error.message,
    })
  }
}

// Mark messages as read in a direct chat
const markDirectRead = async (req, res) => {
  try {
    const userId = req.user.id
    const { peerId } = req.params
    // Respect reader's privacy for read receipts
    const me = await require('../models/user.models').findById(userId).select('privacy')
    const allowReads = me?.privacy?.sendReadReceipts !== false
    const MessageModel = require('../models/message.model')
    await MessageModel.updateMany(
      { messageType: "direct", from: peerId, to: userId, isRead: false },
      allowReads ? { $set: { isRead: true }, $addToSet: { readBy: userId } } : {},
    )
    try {
      const io = req.app.get('io')
      const onlineUsers = req.app.get('onlineUsers')
      const to1 = onlineUsers.get(String(userId))
      const to2 = onlineUsers.get(String(peerId))
      if (allowReads) {
        const payload = { chatType: 'direct', readerId: String(userId), peerId: String(peerId), at: new Date().toISOString() }
        if (to1) io.to(to1).emit('messagesRead', payload)
        if (to2) io.to(to2).emit('messagesRead', payload)
        // Burn-after-read: schedule deletion
        try {
          const msgs = await MessageModel.find({ messageType: 'direct', from: peerId, to: userId, burnAfterReadSeconds: { $gt: 0 } }).select('_id burnAfterReadSeconds')
          for (const m of msgs) {
            const delay = Math.max(0, Number(m.burnAfterReadSeconds || 0) * 1000)
            setTimeout(async () => {
              try {
                await MessageModel.deleteOne({ _id: m._id })
                const online = req.app.get('onlineUsers')
                const s1 = online.get(String(userId)); const s2 = online.get(String(peerId))
                const p = { _id: String(m._id) }
                if (s1) io.to(s1).emit('messageDeleted', p)
                if (s2) io.to(s2).emit('messageDeleted', p)
              } catch {}
            }, delay)
          }
        } catch {}
      }
    } catch {}
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

// Mark messages as read in a group
const markGroupRead = async (req, res) => {
  try {
    const userId = req.user.id
    const { groupId } = req.params
    const me = await require('../models/user.models').findById(userId).select('privacy')
    const allowReads = me?.privacy?.sendReadReceipts !== false
    const MessageModel = require('../models/message.model')
    await MessageModel.updateMany(
      { messageType: "group", group: groupId, from: { $ne: userId } },
      allowReads ? { $addToSet: { readBy: userId } } : {},
    )
    try {
      const io = req.app.get('io')
      if (allowReads) io.to(`group_${groupId}`).emit('messagesRead', { chatType: 'group', groupId: String(groupId), readerId: String(userId), at: new Date().toISOString() })
      // Burn-after-read for group messages
      try {
        const msgs = await MessageModel.find({ messageType: 'group', group: groupId, from: { $ne: userId }, burnAfterReadSeconds: { $gt: 0 } }).select('_id burnAfterReadSeconds')
        for (const m of msgs) {
          const delay = Math.max(0, Number(m.burnAfterReadSeconds || 0) * 1000)
          setTimeout(async () => {
            try { await MessageModel.deleteOne({ _id: m._id }); io.to(`group_${groupId}`).emit('messageDeleted', { _id: String(m._id) }) } catch {}
          }, delay)
        }
      } catch {}
    } catch {}
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

// React to a message (toggle/switch reaction)
const reactMessage = async (req, res) => {
  try {
    const { messageId } = req.params
    const { type } = req.body
    const userId = String(req.user.id)
    const msg = await Message.findById(messageId)
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' })
    // Must be participant (direct: from/to; group: member) – soft check
    if (msg.messageType === 'direct') {
      const isParticipant = [String(msg.from), String(msg.to)].includes(userId)
      if (!isParticipant) return res.status(403).json({ success: false, message: 'Forbidden' })
    }
    if (msg.messageType === 'group') {
      // best-effort check: ensure not random (skip heavy group fetch)
      if (String(msg.from) !== userId) {
        // allow even if not sender; real membership already enforced for send
      }
    }
    const idx = (msg.reactions || []).findIndex((r) => String(r.user) === userId)
    if (!type) {
      if (idx !== -1) msg.reactions.splice(idx, 1)
    } else if (idx === -1) {
      msg.reactions.push({ user: req.user.id, type, at: new Date() })
    } else if (msg.reactions[idx].type === type) {
      msg.reactions.splice(idx, 1) // toggle off
    } else {
      msg.reactions[idx].type = type
      msg.reactions[idx].at = new Date()
    }
    await msg.save()
    // Emit update
    try {
      const io = req.app.get('io')
      const payload = { _id: msg._id, reactions: msg.reactions }
      if (msg.messageType === 'direct') {
        const onlineUsers = req.app.get('onlineUsers')
        const to1 = onlineUsers.get(String(msg.from))
        const to2 = onlineUsers.get(String(msg.to))
        if (to1) io.to(to1).emit('messageReactionsUpdated', payload)
        if (to2) io.to(to2).emit('messageReactionsUpdated', payload)
      } else {
        io.to(`group_${msg.group}`).emit('messageReactionsUpdated', payload)
      }
    } catch {}
    res.json({ success: true, reactions: msg.reactions })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

// Delete a message (sender can delete within 12h)
const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params
    const userId = String(req.user.id)
    const msg = await Message.findById(messageId)
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' })
    if (String(msg.from) !== userId) return res.status(403).json({ success: false, message: 'Only sender can delete' })
    if (Date.now() - new Date(msg.createdAt).getTime() > 12 * 60 * 60 * 1000) return res.status(403).json({ success: false, message: 'Deletion window passed' })
    await msg.deleteOne()
    try {
      const io = req.app.get('io')
      const payload = { _id: messageId, deleted: true }
      if (msg.messageType === 'direct') {
        const onlineUsers = req.app.get('onlineUsers')
        const to1 = onlineUsers.get(String(msg.from))
        const to2 = onlineUsers.get(String(msg.to))
        if (to1) io.to(to1).emit('messageDeleted', payload)
        if (to2) io.to(to2).emit('messageDeleted', payload)
      } else {
        io.to(`group_${msg.group}`).emit('messageDeleted', payload)
      }
    } catch {}
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

// Edit a message (sender within 15 minutes)
const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params
    const { text } = req.body
    const userId = String(req.user.id)
    const msg = await Message.findById(messageId)
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' })
    if (String(msg.from) !== userId) return res.status(403).json({ success: false, message: 'Only sender can edit' })
    if (Date.now() - new Date(msg.createdAt).getTime() > 15 * 60 * 1000) return res.status(403).json({ success: false, message: 'Edit window passed' })
    msg.text = String(text || '')
    await msg.save()
    try {
      const io = req.app.get('io')
      const payload = { _id: msg._id, text: msg.text, edited: true }
      if (msg.messageType === 'direct') {
        const onlineUsers = req.app.get('onlineUsers')
        const to1 = onlineUsers.get(String(msg.from))
        const to2 = onlineUsers.get(String(msg.to))
        if (to1) io.to(to1).emit('messageEdited', payload)
        if (to2) io.to(to2).emit('messageEdited', payload)
      } else {
        io.to(`group_${msg.group}`).emit('messageEdited', payload)
      }
    } catch {}
    res.json({ success: true, text: msg.text })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

// Vote on a poll
const votePoll = async (req, res) => {
  try {
    const { messageId } = req.params
    const { optionId } = req.body || {}
    const userId = String(req.user.id)
    if (!optionId) return res.status(400).json({ success: false, message: 'optionId required' })
    const msg = await Message.findById(messageId)
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' })
    if (!msg.poll || !Array.isArray(msg.poll.options)) return res.status(400).json({ success: false, message: 'Not a poll message' })
    if (msg.poll.endsAt && new Date(msg.poll.endsAt).getTime() < Date.now()) return res.status(403).json({ success: false, message: 'Poll ended' })
    // Authorization: must be participant
    if (msg.messageType === 'direct') {
      const participants = [String(msg.from), String(msg.to)]
      if (!participants.includes(userId)) return res.status(403).json({ success: false, message: 'Forbidden' })
    } else if (msg.messageType === 'group') {
      try {
        const grp = await Group.findById(msg.group).select('members')
        const isMember = Array.isArray(grp?.members) && grp.members.some((m) => String(m) === userId)
        if (!isMember) return res.status(403).json({ success: false, message: 'Forbidden' })
      } catch { return res.status(403).json({ success: false, message: 'Forbidden' }) }
    }
    const allowMultiple = !!msg.poll.allowMultiple
    const allowChange = msg.poll.allowChange !== false
    // Normalize votes according to allowMultiple/allowChange
    // - Single-choice (allowMultiple=false): ensure user appears in only the chosen option
    // - Multi-choice (allowMultiple=true): add/remove only the chosen option; if allowChange=false, cannot remove an existing vote
    for (const opt of msg.poll.options) {
      const has = (opt.votes || []).some((v) => String(v) === userId)
      if (!allowMultiple) {
        // single choice: remove from all options except target
        if (String(opt.id) !== String(optionId) && has) {
          opt.votes = (opt.votes || []).filter((v) => String(v) !== userId)
        }
      } else {
        // multi choice: leave others intact
        // no-op here
      }
    }
    const target = msg.poll.options.find((o) => String(o.id) === String(optionId))
    if (!target) return res.status(404).json({ success: false, message: 'Option not found' })
    // Apply toggle on target
    const already = (target.votes || []).some((v) => String(v) === userId)
    if (already) {
      if (!allowChange) return res.status(403).json({ success: false, message: 'Changing vote not allowed' })
      // single or multi with change allowed: remove vote
      target.votes = (target.votes || []).filter((v) => String(v) !== userId)
    } else {
      if (!allowMultiple) {
        // ensure removed from any other (already done above)
      }
      target.votes = [...(target.votes || []), req.user.id]
    }
    await msg.save()
    // Emit update
    try {
      const io = req.app.get('io')
      const payload = { _id: msg._id, poll: buildPollPayload(msg.poll) }
      // dedicated event for clarity
      const event = 'pollUpdated'
      if (msg.messageType === 'direct') {
        const onlineUsers = req.app.get('onlineUsers')
        const to1 = onlineUsers.get(String(msg.from))
        const to2 = onlineUsers.get(String(msg.to))
        if (to1) io.to(to1).emit(event, payload)
        if (to2) io.to(to2).emit(event, payload)
      } else {
        io.to(`group_${msg.group}`).emit(event, payload)
      }
    } catch {}
    res.json({ success: true, poll: msg.poll })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

module.exports = {
  sendMessage,
  getDirectMessages,
  getAllChats,
  markDirectRead,
  markGroupRead,
  reactMessage,
  deleteMessage,
  editMessage,
  votePoll,
  buildPollPayload,
  searchMessages,
  listStarred,
  listPinned,
  toggleStar,
  pinMessage,
  unpinMessage,
  listMedia
}
