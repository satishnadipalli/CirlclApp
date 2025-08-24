const express = require("express")
const router = express.Router()
const auth = require("../middlewares/auth.middleware")
const upload = require("../middlewares/upload.middleware")
const { sendMessage, getDirectMessages, getAllChats, markDirectRead, markGroupRead } = require("../controllers/message.controllers")
const { reactMessage, deleteMessage, editMessage } = require("../controllers/message.controllers")

// Get all chats (must come first)
router.get("/chats", auth, getAllChats)

// Get direct messages with specific user
router.get("/direct/:withUserId", auth, getDirectMessages)

// Send message (both direct and group)
router.post("/", auth, upload.array("files", 8), sendMessage)

// Mark as read
router.post("/direct/:peerId/read", auth, markDirectRead)
router.post("/group/:groupId/read", auth, markGroupRead)

// Reactions / edit / delete
router.post("/:messageId/react", auth, reactMessage)
router.delete("/:messageId", auth, deleteMessage)
router.put("/:messageId", auth, editMessage)

module.exports = router
