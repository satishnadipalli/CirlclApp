const express = require('express')
const router = express.Router()
const auth = require('../middlewares/auth.middleware')
const { createReport, moderationWebhook } = require('../controllers/safety.controllers')

router.post('/report', auth, createReport)

// Provider moderation webhook (no auth; protect via secret in real deployments)
router.post('/moderation/webhook', express.json({ limit: '256kb' }), moderationWebhook)

module.exports = router