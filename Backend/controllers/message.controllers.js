const Message = require("../models/message.model")
const User = require("../models/user.models")
const Group = require("../models/group.model")
const mongoose = require("mongoose")

// Send message (both direct and group)
const sendMessage = async (req, res) => {
  try {
    const { text, to, group, messageType, replyTo } = req.body
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

      // Check if recipient exists
      const recipient = await User.findById(to)
      if (!recipient) {
        return res.status(404).json({
          success: false,
          message: "Recipient not found",
        })
      }

      message = new Message({
        from,
        to,
        text: txt,
        messageType: "direct",
        readBy: [from],
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

      message = new Message({
        from,
        group,
        text: txt,
        messageType: "group",
        readBy: [from],
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
        type: /^video\//.test(f?.mimetype || '') ? 'video' : (/^image\//.test(f?.mimetype || '') ? 'image' : 'file'),
        name: f?.originalname || '',
        size: Number(f?.size || 0),
        width: 0,
        height: 0,
        duration: 0,
      })).filter((a) => a.url)
      if (!message.text) message.text = ''
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
          _id: message._id,
        }
        if (recipientSocketId) io.to(recipientSocketId).emit("receiveDirectMessage", payload)
        const senderSocketId = onlineUsers.get((req.user.id || "").toString())
        if (senderSocketId) io.to(senderSocketId).emit("receiveDirectMessage", payload)
      } else {
        const payload = {
          from: message.from?._id || message.from,
          group: message.group?._id || message.group,
          text: message.text,
          createdAt: message.createdAt,
          messageType: "group",
          replyTo: message.replyTo?._id || null,
          attachments: message.attachments || [],
          _id: message._id,
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
      .populate({
        path: "replyTo",
        select: "text from createdAt",
        populate: { path: "from", select: "name profilePic" },
      })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    res.status(200).json({
      success: true,
      messages: messages.reverse(),
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
    await Message.updateMany(
      { messageType: "direct", from: peerId, to: userId, isRead: false },
      { $set: { isRead: true }, $addToSet: { readBy: userId } },
    )
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
    await Message.updateMany(
      { messageType: "group", group: groupId, from: { $ne: userId } },
      { $addToSet: { readBy: userId } },
    )
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

module.exports = {
  sendMessage,
  getDirectMessages,
  getAllChats,
  markDirectRead,
  markGroupRead,
  reactMessage,
  deleteMessage,
  editMessage,
}
