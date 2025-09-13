const SwarmSession = require("../models/swarmSession.model")
const Group = require("../models/group.model")
const { createNotification } = require("../utils/functions")
const Message = require("../models/message.model")

// Helpers
function isMember(group, userId) {
  return Array.isArray(group?.members) && group.members.some((m) => String(m) === String(userId))
}
function isAdmin(group, userId) {
  return Array.isArray(group?.admins) && group.admins.some((m) => String(m) === String(userId))
}

// Create a new Swarm session (lobby)
exports.createSwarm = async (req, res) => {
  const { groupId, prompt, invitedUserIds = [], durationMinutes = 15 } = req.body || {}
  if (!groupId || !prompt || String(prompt).trim().length < 6) {
    return res.status(400).json({ success: false, message: "groupId and a longer prompt are required" })
  }
  const group = await Group.findById(groupId)
  if (!group) return res.status(404).json({ success: false, message: "Group not found" })
  if (!isMember(group, req.user._id)) return res.status(403).json({ success: false, message: "Not a group member" })

  const invited = (invitedUserIds || []).filter((id) => !!id)
  const now = new Date()
  const endsAt = new Date(now.getTime() + Math.max(5, Math.min(60, Number(durationMinutes) || 15)) * 60000)

  const doc = await SwarmSession.create({
    group: group._id,
    creator: req.user._id,
    prompt: String(prompt).trim(),
    invited,
    participants: [req.user._id],
    status: "lobby",
    lastPhase: "lobby",
    settings: { durationMinutes: Math.max(5, Math.min(60, Number(durationMinutes) || 15)) },
    startedAt: null,
    endsAt,
  })

  // Notify invitees (best-effort)
  try {
    const uniqueInvitees = Array.from(new Set((invited || []).map(String))).filter((id) => String(id) !== String(req.user._id))
    await Promise.all(uniqueInvitees.map((uid) => createNotification({
      req,
      receiverId: uid,
      senderId: req.user._id,
      type: 'swarm_invite',
      text: String(prompt).slice(0, 140),
      actionLink: `/swarms/${String(doc._id)}`,
    })))
  } catch {}

  return res.json({ success: true, swarm: doc })
}

// Get session by id (permission-checked)
exports.getSwarm = async (req, res) => {
  const { swarmId } = req.params
  const doc = await SwarmSession.findById(swarmId)
  if (!doc) return res.status(404).json({ success: false, message: "Not found" })
  const group = await Group.findById(doc.group)
  if (!group) return res.status(404).json({ success: false, message: "Group not found" })
  if (!isMember(group, req.user._id)) return res.status(403).json({ success: false, message: "Forbidden" })
  // Auto-end if past endsAt
  try {
    if (doc.status === 'active' && doc.endsAt && new Date(doc.endsAt).getTime() < Date.now()) {
      doc.status = 'ended'
      doc.lastPhase = 'ended'
      await doc.save()
    }
  } catch {}
  const isHost = isAdmin(group, req.user._id) || String(doc.creator) === String(req.user._id)
  return res.json({ success: true, swarm: doc, me: String(req.user._id), isHost, serverNow: new Date().toISOString() })
}

// Join lobby or active session
exports.joinSwarm = async (req, res) => {
  const { swarmId } = req.params
  const doc = await SwarmSession.findById(swarmId)
  if (!doc) return res.status(404).json({ success: false, message: "Not found" })
  const group = await Group.findById(doc.group)
  if (!group) return res.status(404).json({ success: false, message: "Group not found" })
  if (!isMember(group, req.user._id)) return res.status(403).json({ success: false, message: "Forbidden" })
  if (!doc.participants.some((p) => String(p) === String(req.user._id))) {
    doc.participants.push(req.user._id)
    await doc.save()
  }
  // Join socket room if connected
  try {
    const io = req.app.get("io")
    const onlineUsers = req.app.get("onlineUsers")
    const sid = onlineUsers.get(String(req.user._id))
    if (io && sid) io.sockets.sockets.get(sid)?.join(`swarm_${doc._id}`)
  } catch {}
  return res.json({ success: true, swarm: doc })
}

// Start session (move from lobby to active)
exports.startSwarm = async (req, res) => {
  const { swarmId } = req.params
  const doc = await SwarmSession.findById(swarmId)
  if (!doc) return res.status(404).json({ success: false, message: "Not found" })
  const group = await Group.findById(doc.group)
  if (!group) return res.status(404).json({ success: false, message: "Group not found" })
  if (!isAdmin(group, req.user._id) && String(doc.creator) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: "Only creator/admin can start" })
  }
  if (doc.status !== "lobby") return res.status(400).json({ success: false, message: "Already started" })
  doc.status = "active"
  doc.lastPhase = "diverge"
  doc.startedAt = new Date()
  if (!doc.endsAt) doc.endsAt = new Date(Date.now() + (doc?.settings?.durationMinutes || 15) * 60000)
  await doc.save()
  try {
    const io = req.app.get("io")
    if (io) io.to(`swarm_${doc._id}`).emit("swarm:phase", { swarmId: String(doc._id), phase: doc.lastPhase })
  } catch {}
  return res.json({ success: true, swarm: doc })
}

// Set phase (host only)
exports.setPhase = async (req, res) => {
  const { swarmId } = req.params
  const { phase } = req.body || {}
  const allowed = ["diverge", "cluster", "vote", "converge"]
  if (!allowed.includes(String(phase))) return res.status(400).json({ success: false, message: "Invalid phase" })
  const doc = await SwarmSession.findById(swarmId)
  if (!doc) return res.status(404).json({ success: false, message: "Not found" })
  const group = await Group.findById(doc.group)
  if (!group) return res.status(404).json({ success: false, message: "Group not found" })
  if (!isAdmin(group, req.user._id) && String(doc.creator) !== String(req.user._id)) return res.status(403).json({ success: false, message: 'Only host' })
  if (doc.status !== 'active') return res.status(400).json({ success: false, message: 'Not active' })
  doc.lastPhase = String(phase)
  await doc.save()
  try {
    const io = req.app.get("io")
    if (io) io.to(`swarm_${doc._id}`).emit("swarm:phase", { swarmId: String(doc._id), phase: doc.lastPhase })
  } catch {}
  return res.json({ success: true, phase: doc.lastPhase })
}

// Post an idea
exports.addIdea = async (req, res) => {
  const { swarmId } = req.params
  const { text } = req.body || {}
  if (!text || String(text).trim().length < 2) return res.status(400).json({ success: false, message: "Idea too short" })
  const doc = await SwarmSession.findById(swarmId)
  if (!doc) return res.status(404).json({ success: false, message: "Not found" })
  const group = await Group.findById(doc.group)
  if (!group) return res.status(404).json({ success: false, message: "Group not found" })
  if (!isMember(group, req.user._id)) return res.status(403).json({ success: false, message: "Forbidden" })
  if (doc.status !== "active") return res.status(400).json({ success: false, message: "Session not active" })
  if (doc.lastPhase !== 'diverge') return res.status(400).json({ success: false, message: "Not accepting ideas now" })
  const idea = { author: req.user._id, text: String(text).trim(), votes: 0 }
  doc.ideas.push(idea)
  await doc.save()
  const savedIdea = doc.ideas[doc.ideas.length - 1]
  try {
    const io = req.app.get("io")
    if (io) io.to(`swarm_${doc._id}`).emit("swarm:idea", { swarmId: String(doc._id), idea: savedIdea })
  } catch {}
  return res.json({ success: true, idea: savedIdea })
}

// Cluster ideas (simple grouping by keyword list from client)
exports.clusterIdeas = async (req, res) => {
  const { swarmId } = req.params
  const { clusters } = req.body || {}
  const doc = await SwarmSession.findById(swarmId)
  if (!doc) return res.status(404).json({ success: false, message: "Not found" })
  const group = await Group.findById(doc.group)
  if (!group) return res.status(404).json({ success: false, message: "Group not found" })
  if (!isMember(group, req.user._id)) return res.status(403).json({ success: false, message: "Forbidden" })
  if (doc.status !== "active") return res.status(400).json({ success: false, message: "Session not active" })
  if (!(isAdmin(group, req.user._id) || String(doc.creator) === String(req.user._id))) return res.status(403).json({ success: false, message: 'Only host can cluster' })

  doc.clusters = Array.isArray(clusters)
    ? clusters.map((c) => ({ title: String(c.title || "Cluster").slice(0, 100), ideaIds: (Array.isArray(c.ideaIds) ? c.ideaIds : []).map((x) => x) }))
    : []
  doc.lastPhase = "cluster"
  await doc.save()
  try {
    const io = req.app.get("io")
    if (io) io.to(`swarm_${doc._id}`).emit("swarm:clusters", { swarmId: String(doc._id), clusters: doc.clusters })
  } catch {}
  return res.json({ success: true, clusters: doc.clusters })
}

// Vote for an idea (1 vote per user per idea)
exports.voteIdea = async (req, res) => {
  const { swarmId, ideaId } = req.params
  const doc = await SwarmSession.findById(swarmId)
  if (!doc) return res.status(404).json({ success: false, message: "Not found" })
  const group = await Group.findById(doc.group)
  if (!group) return res.status(404).json({ success: false, message: "Group not found" })
  if (!isMember(group, req.user._id)) return res.status(403).json({ success: false, message: "Forbidden" })
  if (doc.status !== 'active' || doc.lastPhase !== 'vote') return res.status(400).json({ success: false, message: "Voting is not open" })
  const idea = doc.ideas.id(ideaId)
  if (!idea) return res.status(404).json({ success: false, message: "Idea not found" })
  const existing = doc.votes.find((v) => String(v.user) === String(req.user._id) && String(v.ideaId) === String(ideaId))
  if (existing) return res.status(400).json({ success: false, message: "Already voted" })
  doc.votes.push({ user: req.user._id, ideaId })
  idea.votes = (idea.votes || 0) + 1
  await doc.save()
  try {
    const io = req.app.get("io")
    if (io) io.to(`swarm_${doc._id}`).emit("swarm:votes", { swarmId: String(doc._id), ideaId, votes: idea.votes })
  } catch {}
  return res.json({ success: true, ideaId, votes: idea.votes })
}

// Converge: set actions (owner+due optional)
exports.setActions = async (req, res) => {
  const { swarmId } = req.params
  const { actions = [] } = req.body || {}
  const doc = await SwarmSession.findById(swarmId)
  if (!doc) return res.status(404).json({ success: false, message: "Not found" })
  const group = await Group.findById(doc.group)
  if (!group) return res.status(404).json({ success: false, message: "Group not found" })
  if (!isMember(group, req.user._id)) return res.status(403).json({ success: false, message: "Forbidden" })
  if (!(isAdmin(group, req.user._id) || String(doc.creator) === String(req.user._id))) return res.status(403).json({ success: false, message: 'Only host can set actions' })

  doc.actions = (Array.isArray(actions) ? actions : []).map((a) => ({
    text: String(a.text || "Action").slice(0, 200),
    owner: a.owner || undefined,
    dueAt: a.dueAt ? new Date(a.dueAt) : undefined,
  }))
  doc.lastPhase = "converge"
  await doc.save()
  try {
    const io = req.app.get("io")
    if (io) io.to(`swarm_${doc._id}`).emit("swarm:actions", { swarmId: String(doc._id), actions: doc.actions })
  } catch {}
  return res.json({ success: true, actions: doc.actions })
}

// End session
exports.endSwarm = async (req, res) => {
  const { swarmId } = req.params
  const doc = await SwarmSession.findById(swarmId)
  if (!doc) return res.status(404).json({ success: false, message: "Not found" })
  const group = await Group.findById(doc.group)
  if (!group) return res.status(404).json({ success: false, message: "Group not found" })
  if (!isAdmin(group, req.user._id) && String(doc.creator) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: "Only creator/admin can end" })
  }
  doc.status = "ended"
  doc.lastPhase = "ended"
  await doc.save()
  try {
    const io = req.app.get("io")
    if (io) io.to(`swarm_${doc._id}`).emit("swarm:ended", { swarmId: String(doc._id) })
  } catch {}

  // Post summary message to the group (best-effort)
  try {
    const topIdeas = (doc.ideas || [])
      .map((i) => ({ id: String(i._id), text: i.text, votes: Number(i.votes || 0) }))
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 5)
    const actions = (doc.actions || []).map((a) => `- ${a.text}`).join("\n")
    let summary = `Swarm ended: "${doc.prompt}"
Top ideas:\n${topIdeas.map((i, idx) => `${idx + 1}. ${i.text} (${i.votes})`).join("\n") || '- none'}\n\nActions:\n${actions || '- none'}`
    if (summary.length > 1800) summary = summary.slice(0, 1800) + '…'
    const message = new Message({ from: req.user._id, group: doc.group, text: summary, messageType: 'group', readBy: [req.user._id] })
    await message.save()
    try {
      const io = req.app.get('io')
      io.to(`group_${doc.group}`).emit('receiveGroupMessage', {
        from: String(req.user._id),
        group: String(doc.group),
        text: message.text,
        createdAt: message.createdAt,
        messageType: 'group',
        replyTo: null,
        attachments: [],
        linkPreview: null,
        _id: message._id,
        expiresAt: null,
        burnAfterReadSeconds: null,
      })
    } catch {}
  } catch {}
  return res.json({ success: true, swarm: doc })
}

// List recent swarms by group
exports.listGroupSwarms = async (req, res) => {
  const { groupId } = req.params
  const group = await Group.findById(groupId)
  if (!group) return res.status(404).json({ success: false, message: "Group not found" })
  if (!isMember(group, req.user._id)) return res.status(403).json({ success: false, message: "Forbidden" })
  const swarms = await SwarmSession.find({ group: groupId }).sort({ createdAt: -1 }).limit(20)
  return res.json({ success: true, swarms })
}

// List ended swarms (outcomes) by group
exports.listGroupOutcomes = async (req, res) => {
  const { groupId } = req.params
  const group = await Group.findById(groupId)
  if (!group) return res.status(404).json({ success: false, message: 'Group not found' })
  if (!isMember(group, req.user._id)) return res.status(403).json({ success: false, message: 'Forbidden' })
  const swarms = await SwarmSession.find({ group: groupId, status: 'ended' }).sort({ updatedAt: -1 }).limit(50)
  return res.json({ success: true, swarms })
}

// Heuristic suggestions (fallback when LLM not configured)
function keywordCluster(ideas) {
  const buckets = {}
  for (const it of ideas) {
    const t = String(it.text || '').toLowerCase()
    const key = /design|ui|ux/.test(t) ? 'Design/UX' : /bug|issue|error|fix|broken/.test(t) ? 'Bugs/Issues' : /growth|marketing|share|reach|seo/.test(t) ? 'Growth' : /perf|speed|optimi/.test(t) ? 'Performance' : 'General'
    buckets[key] = buckets[key] || []
    buckets[key].push(String(it._id))
  }
  return Object.entries(buckets).map(([title, ideaIds]) => ({ title, ideaIds }))
}

exports.suggestClusters = async (req, res) => {
  const { swarmId } = req.params
  const doc = await SwarmSession.findById(swarmId)
  if (!doc) return res.status(404).json({ success: false, message: 'Not found' })
  const group = await Group.findById(doc.group)
  if (!group) return res.status(404).json({ success: false, message: 'Group not found' })
  if (!isMember(group, req.user._id)) return res.status(403).json({ success: false, message: 'Forbidden' })
  const clusters = keywordCluster(doc.ideas || [])
  return res.json({ success: true, clusters })
}

exports.suggestActions = async (req, res) => {
  const { swarmId } = req.params
  const doc = await SwarmSession.findById(swarmId)
  if (!doc) return res.status(404).json({ success: false, message: 'Not found' })
  const group = await Group.findById(doc.group)
  if (!group) return res.status(404).json({ success: false, message: 'Group not found' })
  if (!isMember(group, req.user._id)) return res.status(403).json({ success: false, message: 'Forbidden' })
  const top = (doc.ideas || []).slice().sort((a, b) => Number(b.votes || 0) - Number(a.votes || 0)).slice(0, 3)
  const actions = top.map((i) => ({ text: `Prototype: ${i.text.slice(0, 120)}` }))
  return res.json({ success: true, actions })
}

