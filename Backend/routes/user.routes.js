const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware"); // JWT protect
const { register, login, getProfile, updateProfile, followUser, unfollowUser, searchuser, getUserById, getFollowers, getFollowing, listCloseFriends, addCloseFriend, removeCloseFriend, registerPushToken, blockUser, unblockUser, refresh, logout, getNotificationPrefs, updateNotificationPrefs } = require("../controllers/user.controller");
const { getOnlineUsers } = require("../controllers/user.controller");
const { getSuggestions, getMutuals } = require("../controllers/user.controller");
const { getLastSeen } = require("../controllers/user.controller");

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
router.get("/search", auth, searchuser);
// Close Friends
router.get("/me/close-friends", auth, listCloseFriends)
router.post("/close-friends/:id", auth, addCloseFriend)
router.delete("/close-friends/:id", auth, removeCloseFriend)
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
// Presence
router.get('/presence/online', auth, getOnlineUsers)
router.get('/:id/last-seen', auth, getLastSeen)
// Suggestions & Mutuals
router.get('/me/suggestions', auth, getSuggestions)
router.get('/:id/mutuals', auth, getMutuals)
// Place more specific routes before the generic /:id route
router.get("/:id/followers", auth, getFollowers)
router.get("/:id/following", auth, getFollowing)
router.get("/:id", auth, getUserById)



module.exports = router;