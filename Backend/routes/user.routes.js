const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware"); // JWT protect
const { register, login, getProfile, updateProfile, followUser, unfollowUser, searchuser, getUserById, getFollowers, getFollowing, listCloseFriends, addCloseFriend, removeCloseFriend, registerPushToken, blockUser, unblockUser } = require("../controllers/user.controller");

// Public routes
router.post("/register", register);
router.post("/login", login);


// Protected routes
router.get("/me", auth, getProfile);
router.put("/profile", auth, updateProfile);
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
// Place more specific routes before the generic /:id route
router.get("/:id/followers", auth, getFollowers)
router.get("/:id/following", auth, getFollowing)
router.get("/:id", auth, getUserById)



module.exports = router;