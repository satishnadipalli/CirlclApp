const sendExpoPush = async ({ tokens = [], title = "", body = "", data = {} }) => {
  try {
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