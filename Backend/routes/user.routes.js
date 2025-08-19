const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware"); // JWT protect
const { register, login, getProfile, followUser, unfollowUser, searchuser, getUserById, getFollowers, getFollowing } = require("../controllers/user.controller");

// Public routes
router.post("/register", register);
router.post("/login", login);


// Protected routes
router.get("/me", auth, getProfile);
router.post("/:id/follow", auth, followUser);
router.post("/:id/unfollow", auth, unfollowUser);
router.get("/search", auth, searchuser);
// Place more specific routes before the generic /:id route
router.get("/:id/followers", auth, getFollowers)
router.get("/:id/following", auth, getFollowing)
router.get("/:id", auth, getUserById)



module.exports = router;