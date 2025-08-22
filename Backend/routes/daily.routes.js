const express = require("express")
const router = express.Router()
const auth = require("../middlewares/auth.middleware")
const upload = require("../middlewares/upload.middleware")
const { getTodayPrompt, postTodayEntry, getTodayFeed, getMyStreak, getRings, getEntryByUser } = require("../controllers/daily.controllers")
const { getGroupDailyFeed } = require("../controllers/daily.controllers")
const { incrementView, reactToEntry, toggleHighlight } = require("../controllers/daily.controllers")

// Get today prompt and whether user has posted
router.get("/prompt", auth, getTodayPrompt)

// Post today's entry (multipart supported)
router.post("/entry", auth, upload.single("file"), postTodayEntry)

// Get today's unlocked feed (requires user posted)
router.get("/feed", auth, getTodayFeed)

// Get my streak
router.get("/streak", auth, getMyStreak)

// Rings (followers who posted today)
router.get("/rings", auth, getRings)

// Fetch a specific user's entry (requires unlock unless own)
router.get("/entry/:userId", auth, getEntryByUser)

// Group-specific Daily feed for today (requires membership)
router.get("/group/:groupId", auth, getGroupDailyFeed)

// Views / reactions / highlights
router.post("/view", auth, incrementView)
router.post("/react", auth, reactToEntry)
router.post("/highlight", auth, toggleHighlight)

module.exports = router

