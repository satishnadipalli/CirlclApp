const express = require("express");
const router = express.Router();
const postController = require("../controllers/post.controllers");          // keep your current filename
const { uploadToCloudinary } = require("../controllers/upload.controllers"); // keep your current filename
const upload = require("../middlewares/upload.middleware");
const protect = require("../middlewares/auth.middleware");



// Create with media (multipart/form-data)
router.post("/", protect, upload.single("file"), uploadToCloudinary, postController.createPost);

// Feed (with pagination: ?page=1&limit=10)
router.get("/", protect, postController.getAllPosts);
// Following feed
router.get("/following", protect, postController.getFollowingFeed);
// Explore
router.get("/explore", protect, postController.getExplorePosts);
// Place and Nearby
router.get("/place", protect, postController.getPlaceFeed);
router.get("/nearby", protect, postController.getNearbyFeed);

// Reels
router.get("/reels", protect, postController.getReels);
router.post('/:id/not-interested', protect, postController.markNotInterested);
// Reels/watch metrics
router.post("/:id/metrics", protect, postController.recordWatchMetric);

// My posts (also paginated)
router.get("/me", protect, postController.getMyPosts);

// get saved post
router.get("/saved", protect, postController.getSavedPosts);

// Like/unlike post
router.put("/:id/like", protect, postController.likePost);

// Comments
router.post("/:id/comment", protect, postController.addComment);

// Replies (Instagram-style thread)
router.post("/:id/comment/:commentId/reply", protect, postController.replyToComment); // ✅ new

// Like/unlike comment or reply (send { commentId } or { commentId, replyId } in body)
router.put("/:id/comment/like", protect, postController.likeComment);

// Delete comment
router.delete("/:id/comment/:commentId", protect, postController.deleteComment);

// Delete reply
router.delete("/:id/comment/:commentId/reply/:replyId", protect, postController.deleteReply);

// Edit comment
router.put("/:id/comment/:commentId", protect, postController.editComment);

// Edit reply
router.put("/:id/comment/:commentId/reply/:replyId", protect, postController.editReply);

// Save Post
router.put("/:id/save", protect, postController.savePost);

// Delete
router.delete("/:id", protect, postController.deletePost);

// Single post detail
router.get("/:id", protect, postController.getPostById);

module.exports = router;
