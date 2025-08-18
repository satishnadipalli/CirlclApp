const express = require("express")
const router = express.Router()
const auth = require("../middlewares/auth.middleware")
const {
  createGroup,
  getUserGroups,
  getGroupDetails,
  addMembers,
  removeMember,
  makeAdmin,
  removeAdmin,
  getGroupMessages,
} = require("../controllers/group.controllers")

// Create group
router.post("/", auth, createGroup) //tested

// Get user's groups
router.get("/", auth, getUserGroups) //

// Get group details
router.get("/:groupId", auth, getGroupDetails)

// Get group messages
router.get("/:groupId/messages", auth, getGroupMessages)

// Add members to group
router.post("/:groupId/members", auth, addMembers)

// Remove member from group
router.delete("/:groupId/members/:memberId", auth, removeMember)

// Make user admin
router.post("/:groupId/admins/:memberId", auth, makeAdmin)

// Remove admin
router.delete("/:groupId/admins/:adminId", auth, removeAdmin)

module.exports = router
