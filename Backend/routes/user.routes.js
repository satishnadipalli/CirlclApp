const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware"); // JWT protect
const { register, login, getProfile, updateProfile, followUser, unfollowUser, searchuser, getUserById, getFollowers, getFollowing, listCloseFriends, addCloseFriend, removeCloseFriend, registerPushToken, blockUser, unblockUser, refresh, logout, getNotificationPrefs, updateNotificationPrefs } = require("../controllers/user.controller");
const { getUserStreak } = require("../controllers/user.controller");
const { getOnlineUsers } = require("../controllers/user.controller");
const { getSuggestions, getMutuals } = require("../controllers/user.controller");
const { getLastSeen } = require("../controllers/user.controller");
const { listFollowRequests, acceptFollowRequest, declineFollowRequest } = require("../controllers/user.controller");

// Public routes
router.post("/register", register);
router.post("/login", login);
router.post('/refresh', refresh);


// Protected routes
router.get("/me", auth, getProfile);
router.put("/profile", auth, updateProfile);
router.post('/logout', auth, logout);
router.post("/:id/follow", auth, followUser);
router.post("/:id/unfollow", auth, unfollowUser);
// Follow requests (for private accounts)
router.get('/me/follow-requests', auth, listFollowRequests)
router.post('/follow-requests/:id/accept', auth, acceptFollowRequest)
router.post('/follow-requests/:id/decline', auth, declineFollowRequest)
router.get("/search", auth, searchuser);
// Close Friends
router.get("/me/close-friends", auth, listCloseFriends)
router.post("/close-friends/:id", auth, addCloseFriend)
router.delete("/close-friends/:id", auth, removeCloseFriend)
// Follow requests
router.get('/me/follow-requests', auth, require('../controllers/user.controller').listFollowRequests)
router.post('/follow-requests/:id/accept', auth, require('../controllers/user.controller').acceptFollowRequest)
router.post('/follow-requests/:id/decline', auth, require('../controllers/user.controller').declineFollowRequest)
router.get('/me/follow-requests/sent', auth, require('../controllers/user.controller').listSentFollowRequests)
router.post('/follow-requests/:id/cancel', auth, require('../controllers/user.controller').cancelFollowRequest)
// Push
router.post("/me/push-token", auth, registerPushToken)
// Safety
router.post("/:id/block", auth, blockUser)
router.post("/:id/unblock", auth, unblockUser)
// Notification preferences
router.get('/me/notification-prefs', auth, getNotificationPrefs)
router.put('/me/notification-prefs', auth, updateNotificationPrefs)
// Privacy
router.get('/me/privacy', auth, require('../controllers/user.controller').getPrivacy)
router.put('/me/privacy', auth, require('../controllers/user.controller').updatePrivacy)
// Custom status
router.post('/me/custom-status', auth, require('../controllers/user.controller').setCustomStatus)
// Presence
router.get('/presence/online', auth, getOnlineUsers)
router.get('/:id/last-seen', auth, getLastSeen)
// Suggestions & Mutuals
router.get('/me/suggestions', auth, getSuggestions)
router.get('/:id/mutuals', auth, getMutuals)
// Place more specific routes before the generic /:id route
router.get("/:id/followers", auth, getFollowers)
router.get("/:id/following", auth, getFollowing)
router.get("/:id/streak", auth, getUserStreak)
router.get("/:id", auth, getUserById)



module.exports = router;