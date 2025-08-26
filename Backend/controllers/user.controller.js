const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user.models");
const Group = require("../models/group.model");

// Register
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (typeof name !== 'string' || name.trim().length < 2) return res.status(400).json({ success: false, message: 'Name required' })
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, message: 'Valid email required' })
    if (typeof password !== 'string' || password.length < 6) return res.status(400).json({ success: false, message: 'Password too short' })

    let existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();

    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        profilePic: newUser.profilePic,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ success: false, message: 'Email and password required' })

    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Check if password matches
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Generate JWT access (15m) and refresh (30d)
    const accessToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' })
    const refreshToken = jwt.sign({ id: user._id, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: '30d' })
    const crypto = require('crypto')
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
    const exp = new Date(Date.now() + 30 * 24 * 3600 * 1000)
    await User.findByIdAndUpdate(user._id, { $push: { refreshTokens: { tokenHash, expiresAt: exp, userAgent: req.headers['user-agent'] || '', ip: req.ip || '' } } })

    // Send back token + user info
    res.json({
      token: accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePic: user.profilePic || null,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Exchange refresh token for a new access token (and rotate refresh)
const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body || {}
    if (!refreshToken) return res.status(400).json({ success: false, message: 'refreshToken required' })
    let payload
    try { payload = jwt.verify(refreshToken, process.env.JWT_SECRET) } catch { return res.status(401).json({ success: false, message: 'Invalid refresh token' }) }
    if (payload?.type !== 'refresh') return res.status(401).json({ success: false, message: 'Invalid token type' })
    const crypto = require('crypto')
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
    const user = await User.findById(payload.id).select('refreshTokens name email profilePic')
    if (!user) return res.status(404).json({ success: false, message: 'User not found' })
    const record = (user.refreshTokens || []).find((t) => t.tokenHash === tokenHash)
    if (!record || (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now())) {
      return res.status(401).json({ success: false, message: 'Refresh token expired or revoked' })
    }
    // Rotate
    const newAccess = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' })
    const newRefresh = jwt.sign({ id: user._id, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: '30d' })
    const newHash = crypto.createHash('sha256').update(newRefresh).digest('hex')
    const exp = new Date(Date.now() + 30 * 24 * 3600 * 1000)
    user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== tokenHash)
    user.refreshTokens.push({ tokenHash: newHash, expiresAt: exp, userAgent: req.headers['user-agent'] || '', ip: req.ip || '' })
    await user.save()
    res.json({ success: true, token: newAccess, refreshToken: newRefresh, user: { id: user._id, name: user.name, email: user.email, profilePic: user.profilePic || null } })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
}

// Revoke refresh token (logout)
const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body || {}
    if (!refreshToken) return res.json({ success: true })
    const crypto = require('crypto')
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
    await User.findByIdAndUpdate(req.user?.id || undefined, { $pull: { refreshTokens: { tokenHash } } })
    res.json({ success: true })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
}

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, bio, website, profilePic, username } = req.body
    const updates = {}
    if (typeof name === 'string') updates.name = name
    if (typeof bio === 'string') updates.bio = bio
    if (typeof website === 'string') updates.website = website
    if (typeof profilePic === 'string') updates.profilePic = profilePic
    if (typeof username === 'string') {
      const raw = username.trim().toLowerCase()
      if (raw.length < 3 || raw.length > 30) return res.status(400).json({ success: false, message: 'Username must be 3-30 characters' })
      if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])$/.test(raw)) return res.status(400).json({ success: false, message: 'Username can contain letters, numbers, dot, underscore, hyphen; cannot start/end with separator' })
      const exists = await User.findOne({ username: raw, _id: { $ne: req.user.id } }).select('_id')
      if (exists) return res.status(409).json({ success: false, message: 'Username already taken' })
      updates.username = raw
    }

    const updated = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true }).select('-password')
    res.json({ success: true, user: updated })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

const followUser = async (req, res) => {
  try {
    const userToFollow = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user.id);

    if (!userToFollow)
      return res.status(404).json({ message: "User not found" });
    if (currentUser.following.includes(userToFollow._id))
      return res.status(400).json({ message: "Already following" });

    currentUser.following.push(userToFollow._id);
    userToFollow.followers.push(currentUser._id);

    await currentUser.save();
    await userToFollow.save();

    // inside followUser
    const io = req.app.get("io");
    const onlineUsers = req.app.get("onlineUsers");

    // Emit socket event to user being followed
    const socketId = onlineUsers.get(userToFollow._id.toString());
    if (socketId) {
      io.to(socketId).emit("newFollower", {
        followerId: currentUser._id,
        followerName: currentUser.name,
        followedId: userToFollow._id.toString(),
      });
    }

    try {
      const { createNotification } = require("../utils/functions");
      await createNotification({
        req,
        receiverId: userToFollow._id,
        senderId: currentUser._id,
        type: "follow",
        text: "started following you",
      });
    } catch {}

    console.log(`🔹 ${currentUser.name} followed ${userToFollow.name}`);
    res.json({ message: "Followed successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Unfollow user
const unfollowUser = async (req, res) => {
  try {
    const userToUnfollow = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user.id);

    if (!userToUnfollow)
      return res.status(404).json({ message: "User not found" });

    currentUser.following = currentUser.following.filter(
      (id) => !id.equals(userToUnfollow._id)
    );
    userToUnfollow.followers = userToUnfollow.followers.filter(
      (id) => !id.equals(currentUser._id)
    );

    await currentUser.save();
    await userToUnfollow.save();

    // inside unfollowUser
    const io = req.app.get("io");
    const onlineUsers = req.app.get("onlineUsers");

    // Emit socket event to user being unfollowed
    const socketId = onlineUsers.get(userToUnfollow._._id?.toString?.() || userToUnfollow._id.toString());
    if (socketId) {
      io.to(socketId).emit("unfollowed", {
        unfollowerId: currentUser._id,
        unfollowerName: currentUser.name,
        unfollowedId: userToUnfollow._id.toString(),
      });
    }

    console.log(`🔹 ${currentUser.name} unfollowed ${userToUnfollow.name}`);
    res.json({ message: "Unfollowed successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const searchuser = async (req, res) => {
  try {
    const { q, groupId, exclude } = req.query;
    let page = Number.parseInt(req.query.page) || 1
    let limit = Number.parseInt(req.query.limit) || 10
    if (limit > 50) limit = 50
    if (limit < 1) limit = 10

    console.log(q);

    if (!q || q.trim() === "") {
      return res.json({ success: true, users: [] });
    }

    const regex = new RegExp(q, "i"); // case-insensitive regex

    // Build exclusion list: current user, optional group members, optional explicit exclude ids
    const excludeIds = new Set()
    if (req.user?.id) excludeIds.add(req.user.id.toString())
    if (exclude) {
      String(exclude)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((id) => excludeIds.add(id))
    }
    if (groupId) {
      try {
        const grp = await Group.findById(groupId).select("members")
        grp?.members?.forEach((m) => excludeIds.add(m.toString()))
      } catch {}
    }

    // Match on username OR name
    const query = { $or: [ { username: regex }, { name: regex } ] }
    if (excludeIds.size > 0) {
      query._id = { $nin: Array.from(excludeIds) }
    }

    const users = await User.find(query)
      .select("_id name username profilePic")
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

      
      console.log(users)

    res.json({ success: true, users, page, limit });
  } catch (err) {
    console.error("Search user error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const mongoose = require("mongoose");
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "User ID is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }
    const user = await User.findById(id).select("_id name profilePic bio followers following lastActiveAt");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Paginated followers
const getFollowers = async (req, res) => {
  try {
    const { id } = req.params
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 20
    const user = await User.findById(id || req.user.id).select("followers")
    if (!user) return res.status(404).json({ success: false, message: "User not found" })
    const total = user.followers.length
    const start = (page - 1) * limit
    const end = start + limit
    const ids = user.followers.slice(start, end)
    const docs = await User.find({ _id: { $in: ids } }).select("_id name username profilePic")
    res.json({ success: true, page, pages: Math.ceil(total / limit), total, users: docs })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

// Paginated following
const getFollowing = async (req, res) => {
  try {
    const { id } = req.params
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 20
    const user = await User.findById(id || req.user.id).select("following")
    if (!user) return res.status(404).json({ success: false, message: "User not found" })
    const total = user.following.length
    const start = (page - 1) * limit
    const end = start + limit
    const ids = user.following.slice(start, end)
    const docs = await User.find({ _id: { $in: ids } }).select("_id name username profilePic")
    res.json({ success: true, page, pages: Math.ceil(total / limit), total, users: docs })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

// Close Friends management
const listCloseFriends = async (req, res) => {
  try {
    const me = await User.findById(req.user.id).select("closeFriends")
    const docs = await User.find({ _id: { $in: me?.closeFriends || [] } }).select("_id name username profilePic")
    res.json({ success: true, users: docs })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

const addCloseFriend = async (req, res) => {
  try {
    const { id } = req.params
    if (!id) return res.status(400).json({ success: false, message: 'User id required' })
    await User.findByIdAndUpdate(req.user.id, { $addToSet: { closeFriends: id } })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

const removeCloseFriend = async (req, res) => {
  try {
    const { id } = req.params
    if (!id) return res.status(400).json({ success: false, message: 'User id required' })
    await User.findByIdAndUpdate(req.user.id, { $pull: { closeFriends: id } })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

// Register Expo push token
const registerPushToken = async (req, res) => {
  try {
    const { token } = req.body
    if (!token) return res.status(400).json({ success: false, message: 'token required' })
    await User.findByIdAndUpdate(req.user.id, { $addToSet: { expoPushTokens: token } })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

// Preferences
const getNotificationPrefs = async (req, res) => {
  try {
    const me = await User.findById(req.user.id).select('notificationPrefs')
    const prefs = me?.notificationPrefs || { like: true, comment: true, reply: true, mention: true, follow: true, save: true, daily: true, quiet: { enabled: false, start: '22:00', end: '07:00' } }
    res.json({ success: true, prefs })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
}

const updateNotificationPrefs = async (req, res) => {
  try {
    const body = req.body || {}
    const allowed = ['like','comment','reply','mention','follow','save','daily']
    const set = {}
    for (const k of allowed) {
      if (typeof body[k] === 'boolean') set[`notificationPrefs.${k}`] = body[k]
    }
    if (body?.quiet && typeof body.quiet === 'object') {
      if (typeof body.quiet.enabled === 'boolean') set['notificationPrefs.quiet.enabled'] = body.quiet.enabled
      if (typeof body.quiet.start === 'string') set['notificationPrefs.quiet.start'] = body.quiet.start
      if (typeof body.quiet.end === 'string') set['notificationPrefs.quiet.end'] = body.quiet.end
    }
    const me = await User.findByIdAndUpdate(req.user.id, { $set: set }, { new: true }).select('notificationPrefs')
    res.json({ success: true, prefs: me?.notificationPrefs })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
}

// Custom status
const setCustomStatus = async (req, res) => {
  try {
    const { text = '', emoji = '', durationMinutes } = req.body || {}
    let expiresAt = null
    if (durationMinutes && !Number.isNaN(Number(durationMinutes))) {
      expiresAt = new Date(Date.now() + Number(durationMinutes) * 60000)
    }
    const update = { 'customStatus.text': String(text || '').slice(0, 60), 'customStatus.emoji': String(emoji || '').slice(0, 8), 'customStatus.expiresAt': expiresAt }
    const me = await User.findByIdAndUpdate(req.user.id, { $set: update }, { new: true }).select('customStatus')
    // Best-effort presence broadcast
    try {
      const io = req.app.get('io')
      io.emit('userStatusChange', { userId: String(req.user.id), status: 'online', customStatus: me?.customStatus || null })
    } catch {}
    res.json({ success: true, customStatus: me?.customStatus })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
}

// Privacy
const getPrivacy = async (req, res) => {
  try {
    const me = await User.findById(req.user.id).select('privacy')
    const defaults = { showOnline: true, showLastSeen: true, sendTypingIndicators: true, sendReadReceipts: true, allowDMsFrom: 'everyone' }
    const out = me?.privacy || defaults
    res.json({ success: true, privacy: out })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
}

const updatePrivacy = async (req, res) => {
  try {
    const body = req.body || {}
    const set = {}
    if (typeof body.showOnline === 'boolean') set['privacy.showOnline'] = body.showOnline
    if (typeof body.showLastSeen === 'boolean') set['privacy.showLastSeen'] = body.showLastSeen
    if (typeof body.sendTypingIndicators === 'boolean') set['privacy.sendTypingIndicators'] = body.sendTypingIndicators
    if (typeof body.sendReadReceipts === 'boolean') set['privacy.sendReadReceipts'] = body.sendReadReceipts
    if (['everyone','followers','none'].includes(String(body.allowDMsFrom || ''))) set['privacy.allowDMsFrom'] = String(body.allowDMsFrom)
    const me = await User.findByIdAndUpdate(req.user.id, { $set: set }, { new: true }).select('privacy')
    res.json({ success: true, privacy: me?.privacy })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
}

// Block / Unblock
const blockUser = async (req, res) => {
  try {
    const { id } = req.params
    if (!id) return res.status(400).json({ success: false, message: 'user id required' })
    await User.findByIdAndUpdate(req.user.id, { $addToSet: { blockedUsers: id } })
    res.json({ success: true })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
}

const unblockUser = async (req, res) => {
  try {
    const { id } = req.params
    if (!id) return res.status(400).json({ success: false, message: 'user id required' })
    await User.findByIdAndUpdate(req.user.id, { $pull: { blockedUsers: id } })
    res.json({ success: true })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
}

// Presence: list currently online user ids (best-effort)
const getOnlineUsers = async (req, res) => {
  try {
    const onlineUsers = req.app.get('onlineUsers')
    if (!onlineUsers) return res.json({ success: true, userIds: [] })
    const ids = Array.from(onlineUsers.keys()).map(String)
    res.json({ success: true, userIds: ids })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
}

// Suggestions based on mutual connections (friends-of-friends)
const getSuggestions = async (req, res) => {
  try {
    const me = await User.findById(req.user.id).select('following blockedUsers')
    if (!me) return res.status(404).json({ success: false, message: 'User not found' })
    const myId = String(req.user.id)
    const followingIds = (me.following || []).map((x) => String(x))
    const blocked = new Set((me.blockedUsers || []).map((x) => String(x)))

    // Candidates: users followed by people I follow (exclude me, already following, blocked)
    const candidates = await User.find({
      _id: { $ne: myId },
      followers: { $in: followingIds },
      // exclusion filters applied after fetch for simplicity
    }).select('_id name username profilePic followers')
      .limit(400)

    const items = []
    for (const u of candidates) {
      const uid = String(u._id)
      if (blocked.has(uid)) continue
      if (followingIds.includes(uid)) continue
      // mutuals = my following intersect u.followers
      const followersArr = (u.followers || []).map((x) => String(x))
      let count = 0
      const mutualIds = []
      const setMy = new Set(followingIds)
      for (const f of followersArr) { if (setMy.has(String(f))) { count++; mutualIds.push(String(f)); } }
      if (count === 0) continue
      items.push({ u, count, mutualIds })
    }

    // Sort by mutual count desc and trim
    items.sort((a, b) => b.count - a.count)
    const top = items.slice(0, 20)

    // Resolve up to two mutual names per suggestion
    const idSet = new Set()
    top.forEach(x => x.mutualIds.slice(0,2).forEach(id => idSet.add(id)))
    const mutualDocs = await User.find({ _id: { $in: Array.from(idSet) } }).select('_id name username')
    const nameById = new Map(mutualDocs.map(d => [String(d._id), d.name || d.username || 'Friend']))

    const suggestions = top.map(({ u, count, mutualIds }) => ({
      user: { _id: String(u._id), name: u.name, username: u.username, profilePic: u.profilePic || '' },
      mutualCount: count,
      mutualNames: mutualIds.slice(0,2).map((id) => nameById.get(String(id)) || 'Friend'),
    }))

    return res.json({ success: true, suggestions })
  } catch (e) { return res.status(500).json({ success: false, message: e.message }) }
}

// List mutual connections with a target user
const getMutuals = async (req, res) => {
  try {
    const targetId = String(req.params.id || '')
    if (!targetId) return res.status(400).json({ success: false, message: 'id required' })
    const me = await User.findById(req.user.id).select('following')
    if (!me) return res.status(404).json({ success: false, message: 'User not found' })
    const target = await User.findById(targetId).select('followers')
    if (!target) return res.status(404).json({ success: false, message: 'Target not found' })
    const myFollowingSet = new Set((me.following || []).map((x) => String(x)))
    const mutualIds = (target.followers || []).map((x) => String(x)).filter((id) => myFollowingSet.has(id))
    const limit = Math.min(30, Math.max(1, Number.parseInt(req.query.limit) || 10))
    const docs = await User.find({ _id: { $in: mutualIds } }).select('_id name username profilePic').limit(limit)
    return res.json({ success: true, total: mutualIds.length, users: docs })
  } catch (e) { return res.status(500).json({ success: false, message: e.message }) }
}

// Last seen timestamp for a user (respect target's privacy.showLastSeen)
const getLastSeen = async (req, res) => {
  try {
    const { id } = req.params
    const user = await User.findById(id).select('_id lastActiveAt privacy')
    if (!user) return res.status(404).json({ success: false, message: 'User not found' })
    const allowed = user?.privacy?.showLastSeen !== false
    res.json({ success: true, lastActiveAt: allowed ? user.lastActiveAt : null })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  getProfile,
  updateProfile,
  followUser,
  unfollowUser,
  searchuser,
  getUserById,
  getFollowers,
  getFollowing,
  listCloseFriends,
  addCloseFriend,
  removeCloseFriend,
  registerPushToken,
  blockUser,
  unblockUser,
  getNotificationPrefs,
  updateNotificationPrefs,
  getPrivacy,
  updatePrivacy,
  getOnlineUsers,
  getSuggestions,
  getMutuals,
  getLastSeen,
};