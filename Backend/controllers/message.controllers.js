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
      {
        $sort: { createdAt: -1 },
      },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ["$from", new mongoose.Types.ObjectId(userId)] }, "$to", "$from"],
          },
          lastMessage: { $first: "$$ROOT" },
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
      {
        $unwind: "$user",
      },
      {
        $lookup: {
          from: "users",
          localField: "lastMessage.from",
          foreignField: "_id",
          as: "lastMessage.from",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "lastMessage.to",
          foreignField: "_id",
          as: "lastMessage.to",
        },
      },
      {
        $unwind: "$lastMessage.from",
      },
      {
        $unwind: "$lastMessage.to",
      },
      {
        $project: {
          _id: 1,
          user: {
            _id: "$user._id",
            name: "$user.name",
            profilePic: "$user.profilePic",
          },
          lastMessage: {
            _id: "$lastMessage._id",
            from: {
              _id: "$lastMessage.from._id",
              name: "$lastMessage.from.name",
              profilePic: "$lastMessage.from.profilePic",
            },
            to: {
              _id: "$lastMessage.to._id",
              name: "$lastMessage.to.name",
              profilePic: "$lastMessage.to.profilePic",
            },
            text: "$lastMessage.text",
            createdAt: "$lastMessage.createdAt",
            isRead: "$lastMessage.isRead",
          },
          chatType: "direct",
        },
      },
    ])

    // Get user's groups with latest messages
    const groupChats = await Group.aggregate([
      { $match: { members: new mongoose.Types.ObjectId(userId), isActive: true } },
      { $sort: { updatedAt: -1 } },
      {
        $lookup: {
          from: "messages",
          let: { groupId: "$_id" },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ["$group", "$$groupId"] }, { $eq: ["$messageType", "group"] }] } } },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
          ],
          as: "lastMessage",
        },
      },
      { $unwind: { path: "$lastMessage", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: "$_id",
          name: 1,
          groupPic: 1,
          memberCount: { $size: "$members" },
          lastMessage: 1,
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

module.exports = {
  sendMessage,
  getDirectMessages,
  getAllChats,
}
