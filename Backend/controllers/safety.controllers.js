const Report = require('../models/report.model')

const createReport = async (req, res) => {
  try {
    const { targetType, targetId, reason, details = '', targetUser } = req.body
    if (!targetType || !targetId || !reason) return res.status(400).json({ success: false, message: 'targetType, targetId, reason required' })
    const doc = await Report.create({ reporter: req.user._id, targetType, targetId, reason, details, targetUser: targetUser || undefined })
    res.status(201).json({ success: true, report: doc })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
}

// Placeholder moderation webhook receiver for async providers (e.g., Cloudinary/Google Vision)
const moderationWebhook = async (req, res) => {
  try {
    // Expect provider-specific payload
    // TODO: verify signature if available
    const payload = req.body || {}
    // Log and accept for now
    console.log('[moderation] webhook', JSON.stringify(payload).slice(0, 2000))
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false })
  }
}

module.exports = { createReport, moderationWebhook }