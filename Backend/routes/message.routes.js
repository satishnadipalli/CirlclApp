const express = require("express")
const router = express.Router()
const auth = require("../middlewares/auth.middleware")
const upload = require("../middlewares/upload.middleware")
const { sendMessage, getDirectMessages, getAllChats, markDirectRead, markGroupRead } = require("../controllers/message.controllers")
const { searchMessages } = require("../controllers/message.controllers")
const { toggleStar, pinMessage, listMedia } = require("../controllers/message.controllers")
const { listStarred, listPinned } = require("../controllers/message.controllers")
const { reactMessage, deleteMessage, editMessage } = require("../controllers/message.controllers")
const { votePoll } = require("../controllers/message.controllers")

// Get all chats (must come first)
router.get("/chats", auth, getAllChats)

// Get direct messages with specific user
router.get("/direct/:withUserId", auth, getDirectMessages)

// Search within a direct conversation
router.get('/direct/:peerId/search', auth, searchMessages)

// Send message (both direct and group)
router.post("/", auth, upload.array("files", 8), sendMessage)

// Mark as read
router.post("/direct/:peerId/read", auth, markDirectRead)
router.post("/group/:groupId/read", auth, markGroupRead)

// Search within a group conversation
router.get('/group/:groupId/search', auth, searchMessages)

// Stars and pins
router.post('/:messageId/star', auth, toggleStar)
router.post('/:messageId/pin', auth, pinMessage)

// Media gallery
router.get('/direct/:peerId/media', auth, listMedia)
router.get('/group/:groupId/media', auth, listMedia)
router.get('/direct/:peerId/starred', auth, listStarred)
router.get('/group/:groupId/starred', auth, listStarred)
router.get('/direct/:peerId/pinned', auth, listPinned)
router.get('/group/:groupId/pinned', auth, listPinned)

// Reactions / edit / delete
router.post("/:messageId/react", auth, reactMessage)
router.delete("/:messageId", auth, deleteMessage)
router.put("/:messageId", auth, editMessage)

// Polls
router.post("/:messageId/poll/vote", auth, votePoll)

module.exports = router
