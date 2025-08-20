const express = require("express")
const router = express.Router()
const auth = require("../middlewares/auth.middleware")
const upload = require("../middlewares/upload.middleware")
const { getTodayPrompt, postTodayEntry, getTodayFeed, getMyStreak } = require("../controllers/daily.controllers")

// Get today prompt and whether user has posted
router.get("/prompt", auth, getTodayPrompt)

// Post today's entry (multipart supported)
router.post("/entry", auth, upload.single("file"), postTodayEntry)

// Get today's unlocked feed (requires user posted)
router.get("/feed", auth, getTodayFeed)

// Get my streak
router.get("/streak", auth, getMyStreak)

module.exports = router

