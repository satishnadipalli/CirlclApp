const express = require("express")
const router = express.Router()
const auth = require("../middlewares/auth.middleware")
const upload = require("../middlewares/upload.middleware")
const { getTodayPrompt, postTodayEntry, getTodayFeed, getMyStreak, getRings, getEntryByUser, deleteEntry, listViewers } = require("../controllers/daily.controllers")
const { getGroupDailyFeed } = require("../controllers/daily.controllers")
const { incrementView, reactToEntry, toggleHighlight } = require("../controllers/daily.controllers")
const { getHighlights } = require("../controllers/daily.controllers")
const { getReactionsSummary, listReactors } = require("../controllers/daily.controllers")
const { getCaptions, putCaptions } = require("../controllers/daily.controllers")
const { autoCaptions } = require("../controllers/daily.controllers")
const { remindGroupMembers } = require("../controllers/daily.controllers")

// Get today prompt and whether user has posted
router.get("/prompt", auth, getTodayPrompt)

// Post today's entry (multipart supported)
router.post("/entry", auth, upload.single("file"), postTodayEntry)

// Use a late pass to unlock today
router.post('/late-pass', auth, require('../controllers/daily.controllers').useLatePass)

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

// Group admin prompt
router.post('/group/:groupId/prompt', auth, require('../controllers/daily.controllers').setGroupPrompt)

// Remind remaining members to post today
router.post('/group/:groupId/remind', auth, remindGroupMembers)

// Views / reactions / highlightss
router.post("/view", auth, incrementView)
router.get("/:entryId/viewers", auth, listViewers)
router.post("/react", auth, reactToEntry)
router.post("/highlight", auth, toggleHighlight)
// Highlights list
router.get("/highlights", auth, getHighlights)
// Reactions summary and reactors list
router.get("/:entryId/reactions", auth, getReactionsSummary)
router.get("/:entryId/reactors", auth, listReactors)
// Captions
router.get("/:entryId/captions", auth, getCaptions)
router.put("/:entryId/captions", auth, putCaptions)
router.post("/:entryId/captions/auto", auth, autoCaptions)

// Delete own entry
router.delete('/:entryId', auth, deleteEntry)

module.exports = router

