const { default: mongoose } = require("mongoose")
const Group = require("../models/group.model")
const Message = require("../models/message.model")
const User = require("../models/user.models")

// Create a new group
const createGroup = async (req, res) => {
  try {
    const { name, description, members = [] } = req.body
    const creator = req.user.id

    // Ensure creator is in members list
    const allMembers = [...new Set([creator, ...members])]

    const group = new Group({
      name,
      description,
      creator,
      members: allMembers,
      admins: [creator],
    })

    await group.save()
    await group.populate("creator members admins", "name email profilePic")

    res.status(201).json({
      success: true,
      message: "Group created successfully",
      group,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating group",
      error: error.message,
    })
  }
}

// Get user's groups
const getUserGroups = async (req, res) => {
  try {
    const userId = req.user.id

    const groups = await Group.find({
      members: userId,
      isActive: true,
    })
      .populate("creator", "name email profilePic")
      .populate("members", "name email profilePic")
      .populate("admins", "name email profilePic")
      .sort({ updatedAt: -1 })

    res.status(200).json({
      success: true,
      groups,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching groups",
      error: error.message,
    })
  }
}

// Get group details
const getGroupDetails = async (req, res) => {
  try {
    const { groupId } = req.params
    const userId = req.user.id

    const group = await Group.findById(groupId)
      .populate("creator", "name email profilePic")
      .populate("members", "name email profilePic")
      .populate("admins", "name email profilePic")

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      })
    }

    // Check if user is a member
    if (!group.members.some((member) => member._id.toString() === userId)) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      })
    }

    res.status(200).json({
      success: true,
      group,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching group details",
      error: error.message,
    })
  }
}

// Add members to group
const addMembers = async (req, res) => {
  try {
    const { groupId } = req.params
    const { members } = req.body
    const userId = req.user.id

    const group = await Group.findById(groupId)
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      })
    }

    // Check if user is admin
    if (!group.admins.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: "Only admins can add members",
      })
    }

    // Add new members (avoid duplicates)
    const newMembers = members.filter((memberId) => !group.members.includes(memberId))

    group.members.push(...newMembers)
    await group.save()
    await group.populate("members", "name email profilePic")

    res.status(200).json({
      success: true,
      message: "Members added successfully",
      group,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error adding members",
      error: error.message,
    })
  }
}

// Remove member from group
const removeMember = async (req, res) => {
  try {
    const { groupId, memberId } = req.params
    const userId = req.user.id

    const group = await Group.findById(groupId)
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      })
    }

    // Check if user is admin
    if (!group.admins.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: "Only admins can remove members",
      })
    }

    // Cannot remove creator
    if (memberId === group.creator.toString()) {
      return res.status(400).json({
        success: false,
        message: "Cannot remove group creator",
      })
    }

    // Remove from members and admins
    group.members = group.members.filter((id) => id.toString() !== memberId)
    group.admins = group.admins.filter((id) => id.toString() !== memberId)

    await group.save()

    res.status(200).json({
      success: true,
      message: "Member removed successfully",
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error removing member",
      error: error.message,
    })
  }
}

// Make user admin
const makeAdmin = async (req, res) => {
  try {
    const { groupId, memberId } = req.params
    const userId = req.user.id

    const group = await Group.findById(groupId)
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      })
    }

    // Check if user is admin
    if (!group.admins.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: "Only admins can promote members",
      })
    }

    // Check if member exists in group
    if (!group.members.includes(memberId)) {
      return res.status(400).json({
        success: false,
        message: "User is not a member of this group",
      })
    }

    // Add to admins if not already
    if (!group.admins.includes(memberId)) {
      group.admins.push(memberId)
      await group.save()
    }

    res.status(200).json({
      success: true,
      message: "User promoted to admin successfully",
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error promoting user",
      error: error.message,
    })
  }
}

// Remove admin (but keep as member)
const removeAdmin = async (req, res) => {
  try {
    const { groupId, adminId } = req.params
    const userId = req.user.id

    const group = await Group.findById(groupId)
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      })
    }

    // Check if user is admin
    if (!group.admins.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: "Only admins can demote other admins",
      })
    }

    // Cannot remove creator as admin
    if (adminId === group.creator.toString()) {
      return res.status(400).json({
        success: false,
        message: "Cannot remove creator as admin",
      })
    }

    // Remove from admins
    group.admins = group.admins.filter((id) => id.toString() !== adminId)
    await group.save()

    res.status(200).json({
      success: true,
      message: "Admin removed successfully",
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error removing admin",
      error: error.message,
    })
  }
}

// Get group messages
const getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params
    const userId = req.user.id
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 50

    const group = await Group.findById(groupId)
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      })
    }

    // Convert userId to ObjectId for proper comparison
    const userObjectId = new mongoose.Types.ObjectId(userId)
    const isMember = group.members.some((memberId) => memberId.equals(userObjectId))

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "Access denied - not a group member",
      })
    }

    console.log("[v0] Searching for messages with groupId:", groupId)
    console.log("[v0] Group exists:", !!group)
    console.log("[v0] User is member:", isMember)

    const messages = await Message.find({
      group: groupId,
      messageType: "group",
    })
      .populate("from", "name profilePic")
      .populate({ path: "replyTo", select: "text from createdAt", populate: { path: "from", select: "name profilePic" } })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    console.log("[v0] Found messages count:", messages.length)

    res.status(200).json({
      success: true,
      messages: messages.reverse(), // Reverse to show oldest first
    })
  } catch (error) {
    console.log("[v0] Error in getGroupMessages:", error.message)
    res.status(500).json({
      success: false,
      message: "Error fetching messages",
      error: error.message,
    })
  }
}
module.exports = {
  createGroup,
  getUserGroups,
  getGroupDetails,
  addMembers,
  removeMember,
  makeAdmin,
  removeAdmin,
  getGroupMessages,
}
