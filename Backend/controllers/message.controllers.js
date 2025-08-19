const Message = require("../models/message.model")
const User = require("../models/user.models")
const Group = require("../models/group.model")
const mongoose = require("mongoose")

// Send message (both direct and group)
const sendMessage = async (req, res) => {
  try {
    const { text, to, group, messageType, replyTo } = req.body
    const from = req.user.id

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
        text,
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
        text,
        messageType: "group",
        readBy: [from],
      })
    }

    // Optional replyTo association
    if (replyTo && mongoose.Types.ObjectId.isValid(replyTo)) {
      message.replyTo = replyTo
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

module.exports = {
  sendMessage,
  getDirectMessages,
  getAllChats,
  markDirectRead,
  markGroupRead,
}
