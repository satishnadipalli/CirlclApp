const express = require("express")
const router = express.Router()
const auth = require("../middlewares/auth.middleware")
const { sendMessage, getDirectMessages, getAllChats } = require("../controllers/message.controllers")

// Get all chats (must come first)
router.get("/chats", auth, getAllChats)

// Get direct messages with specific user
router.get("/direct/:withUserId", auth, getDirectMessages)

// Send message (both direct and group)
router.post("/", auth, sendMessage)

module.exports = router
