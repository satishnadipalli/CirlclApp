const User = require('../models/user.models')

function withinQuietHours(q, now = new Date()) {
  if (!q || q.enabled !== true) return false
  const start = String(q.start || '22:00')
  const end = String(q.end || '07:00')
  const [sh, sm] = start.split(':').map((x) => parseInt(x, 10))
  const [eh, em] = end.split(':').map((x) => parseInt(x, 10))
  const minutes = now.getHours() * 60 + now.getMinutes()
  const s = (isNaN(sh)?22:sh) * 60 + (isNaN(sm)?0:sm)
  const e = (isNaN(eh)?7:eh) * 60 + (isNaN(em)?0:em)
  if (s <= e) return minutes >= s && minutes < e
  return minutes >= s || minutes < e
}

const sendExpoPush = async ({ tokens = [], title = "", body = "", data = {}, receiverId = null }) => {
  try {
    // Quiet hours gating
    if (receiverId) {
      try {
        const u = await User.findById(receiverId).select('notificationPrefs')
        const q = u?.notificationPrefs?.quiet
        if (withinQuietHours(q)) return { success: true, sent: 0 }
      } catch {}
    }
    const valid = (tokens || []).filter((t) => typeof t === 'string' && t.startsWith('ExponentPushToken'))
    if (valid.length === 0) return { success: true, sent: 0 }

    const chunks = []
    for (let i = 0; i < valid.length; i += 90) chunks.push(valid.slice(i, i + 90))

    let sent = 0
    for (const chunk of chunks) {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk.map((to) => ({ to, title, body, data }))),
      })
      if (res.ok) sent += chunk.length
    }
    return { success: true, sent }
  } catch (e) {
    return { success: false, error: e?.message }
  }
}

module.exports = { sendExpoPush }