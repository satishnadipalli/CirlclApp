const Post = require("../models/post.model");
const User = require("../models/user.models");
const Notification = require("../models/notification.model");
const { createNotification } = require("../utils/functions");
// const { io, onlineUsers } = require("../server"); // import here only

const extractTags = (text = "") => {
  const hashtags = (text.match(/#\w+/g) || []).map((tag) =>
    tag.substring(1).toLowerCase()
  );
  const mentions = (text.match(/@[\w.-]+/g) || []).map((tag) =>
    tag.substring(1).toLowerCase()
  );
  return { hashtags, mentions };
};

const createPost = async (req, res) => {
  try {
    const { title, description = "" } = req.body
    if (!title) return res.status(400).json({ message: "Title is required" })

    const hashtags = (description.match(/#\w+/g) || []).map((t) => t.substring(1).toLowerCase())
    const mentions = (description.match(/@[\w.-]+/g) || []).map((u) => u.substring(1).toLowerCase())

    const lng = req.body?.lng != null ? Number(req.body.lng) : null
    const lat = req.body?.lat != null ? Number(req.body.lat) : null
    const locationName = req.body?.locationName || ""

    const doc = {
      title,
      description,
      mediaUrl: req.fileUrl, // Save the Cloudinary URL from uploadToCloudinary middleware
      user: req.user._id,
      hashtags,
      mentions,
      locationName,
    }
    if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
      doc.geo = { type: "Point", coordinates: [lng, lat] }
    }

    const newPost = await Post.create(doc)

    if (mentions.length > 0) {
      console.log("mentions", mentions)

      const patterns = mentions.map((m) => new RegExp(`^${m}$`, "i"))
      const mentionedUsers = await User.find({
        $or: [
          { username: { $in: patterns } },
          { name: { $in: patterns } }, // fallback for legacy mentions
        ],
      }).select("_id")
      console.log(mentionedUsers)
      for (const mentionedUser of mentionedUsers) {
        if (mentionedUser._id.toString() !== req.user._id.toString()) {
          await createNotification({
            req, // pass req
            receiverId: mentionedUser._id,
            senderId: req.user._id,
            type: "mention",
            postId: newPost._id,
            text: description,
            actionLink: `/post/${newPost._id}`,
          })
        }
      }
    }

    res.status(201).json(newPost)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}


// controllers/post.controllers.js
const getAllPosts = async (req, res) => {
  try {
    let { page = 1, limit = 10, hashtag, mention, userId } = req.query;
    page = Math.max(1, parseInt(page));
    limit = Math.min(50, Math.max(1, parseInt(limit)));

    const filter = {};
    if (userId) filter.user = userId;
    if (hashtag) filter.hashtags = hashtag.toLowerCase();
    if (mention) filter.mentions = mention;

    const totalPosts = await Post.countDocuments(filter);

    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("user", "name profilePic")
      .populate("comments.user", "name profilePic")
      .populate("comments.replies.user", "name profilePic");

    res.json({
      success: true,
      currentPage: page,
      totalPages: Math.ceil(totalPosts / limit),
      totalPosts,
      posts,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getMyPosts = async (req, res) => {
  try {
    let { page = 1, limit = 10, hashtag, mention } = req.query
    page = Math.max(1, Number.parseInt(page))
    limit = Math.min(50, Math.max(1, Number.parseInt(limit)))

    const filter = { user: req.user.id }

    // Filter by hashtag if passed
    if (hashtag) {
      filter.hashtags = hashtag.toLowerCase()
    }

    // Filter by mention if passed
    if (mention) {
      filter.mentions = mention
    }

    const totalPosts = await Post.countDocuments(filter)

    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("user", "name profilePic followers following")
      .populate("comments.user", "name profilePic")
      .populate("comments.replies.user", "name profilePic")

    const handle = (req.user?.username && String(req.user.username).trim()) ? req.user.username : req.user.name
    const mentionedPosts = await Post.find({
      mentions: { $regex: new RegExp(`^${handle}$`, "i") },
    })
      .sort({ createdAt: -1 })
      .populate("user", "name profilePic followers following")
      .populate("comments.user", "name profilePic")
      .populate("comments.replies.user", "name profilePic")

      console.log("mentionedPosts",mentionedPosts)
    res.json({
      success: true,
      currentPage: page,
      totalPages: Math.ceil(totalPosts / limit),
      totalPosts,
      posts,
      mentionedPosts, // Include mentioned posts in response
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
}



const getPostsByUserId = async (req, res) => {
  try {
    const { id } = req.body

    if (!id) {
      return res.status(400).json({ success: false, message: "User ID is required" })
    }

    let { page = 1, limit = 10, hashtag, mention } = req.query
    page = Math.max(1, Number.parseInt(page))
    limit = Math.min(50, Math.max(1, Number.parseInt(limit)))

    const filter = { user: id }

    // Filter by hashtag if passed
    if (hashtag) {
      filter.hashtags = hashtag.toLowerCase()
    }

    // Filter by mention if passed
    if (mention) {
      filter.mentions = mention
    }

    const totalPosts = await Post.countDocuments(filter)

    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("user", "name profilePic followers following")
      .populate("comments.user", "name profilePic")
      .populate("comments.replies.user", "name profilePic")

    res.json({
      success: true,
      currentPage: page,
      totalPages: Math.ceil(totalPosts / limit),
      totalPosts,
      posts,
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
}

// Delete post
const deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (post.user.toString() !== req.user.id)
      return res.status(403).json({ message: "Not authorized" });

    await post.deleteOne();

    // return fresh list for the user (optional but handy)
    const posts = await Post.find({ user: req.user.id }).sort({
      createdAt: -1,
    });
    res.json({ message: "Post deleted", posts });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Like/unlike post
const likePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const already = post.likes.some((u) => u.toString() === req.user.id);
    if (already) {
      post.likes = post.likes.filter((u) => u.toString() !== req.user.id);
    } else {
      post.likes.push(req.user.id);

      console.log({
        receiverId: post.user, // ✅ was 'receiver' before
          senderId: req.user.id, // ✅ correct
          type: "like",
          post: post._id,
      })

      // 🔔 Create notification for like
      if (post.user.toString() !== req.user.id.toString()) {
        await createNotification({
          req, // pass req
          receiverId: post.user, // ✅ was 'receiver' before
          senderId: req.user.id, // ✅ correct
          type: "like",
          post: post._id,
          actionLink: `/post/${post._id}`,
        });
      }
    }

    await post.save();

    // ✅ Populate user data before sending back
    await post.populate([
      { path: "user", select: "name profilePic" },
      { path: "comments.user", select: "name profilePic" },
      { path: "comments.replies.user", select: "name profilePic" },
    ]);

    res.json(post);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const addComment = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (!req.body.text)
      return res.status(400).json({ message: "Text is required" });

    const user = await User.findById(req.user.id).select("name profilePic");

    // Extract hashtags and mentions (case-insensitive)
    const hashtags = (req.body.text.match(/#\w+/g) || []).map((tag) =>
      tag.slice(1).toLowerCase()
    );
    const mentions = (req.body.text.match(/@[\w.-]+/g) || []).map((m) =>
      m.slice(1).toLowerCase()
    );

    // Add comment to post
    post.comments.push({
      user: req.user.id,
      text: req.body.text,
      name: user?.name,
      profilePic: user?.profilePic,
      hashtags,
      mentions,
    });

    await post.save();

    // 🔔 Notification for comment to post owner
    console.log(post.user.toString(), req.user.id.toString());
    if (post.user.toString() !== req.user.id.toString()) {
      await createNotification({
        req,
        receiverId: post.user,
        senderId: req.user.id,
        type: "comment",
        postId: post._id,
        text: req.body.text,
        actionLink: `/post/${post._id}?focusCommentId=${post.comments[post.comments.length - 1]?._id || ''}`,
      });
    }

    // 🔔 Notifications for mentions in comment
    if (mentions.length > 0) {
      // Match users by username first, fallback to name (case-insensitive)
      const patterns = mentions.map((n) => new RegExp(`^${n}$`, "i"))
      const mentionedUsers = await User.find({
        $or: [ { username: { $in: patterns } }, { name: { $in: patterns } } ],
      }).select("_id");

      console.log("mentioned uers", mentionedUsers);
      for (const mentionedUser of mentionedUsers) {
        if (mentionedUser._id.toString() !== req.user.id.toString()) {
          console.log("hi", {
            req: req,
            receiverId: mentionedUser._id,
            senderId: req.user.id,
            type: "mention",
            postId: post._id,
            text: req.body.text,
          });
          await createNotification({
            req,
            receiverId: mentionedUser._id,
            senderId: req.user.id,
            type: "mention",
            postId: post._id,
            text: req.body.text,
            actionLink: `/post/${post._id}`,
          });
        }
      }
    }

    res.json(post);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

const replyToComment = async (req, res) => {
  try {
    const { id: postId, commentId } = req.params;
    const { text } = req.body;

    if (!text) return res.status(400).json({ message: "text is required" });

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    // Extract hashtags and mentions
    const hashtags = (text.match(/#\w+/g) || []).map((tag) =>
      tag.slice(1).toLowerCase()
    );
    const mentions = (text.match(/@[\w.-]+/g) || []).map((m) => m.slice(1).toLowerCase());

    comment.replies.push({
      user: req.user.id,
      text,
      likes: [],
      hashtags,
      mentions,
    });

    await post.save();

    // 🔔 Notification to comment owner (reply)
    if (comment.user.toString() !== req.user.id.toString()) {
      await createNotification({
        req,
        receiverId: comment.user, // ✅ correct
        senderId: req.user.id, // ✅ correct
        type: "reply",
        postId: post._id,
        commentId: comment._id,
        text, // optional: show reply text
        actionLink: `/post/${post._id}?focusCommentId=${comment._id}`,
      });
    }

    // 🔔 Mention notifications in reply
    if (mentions.length > 0) {
      const patterns = mentions.map((m) => new RegExp(`^${m}$`, "i"))
      const mentionedUsers = await User.find({
        $or: [ { username: { $in: patterns } }, { name: { $in: patterns } } ],
      }).select("_id");
      for (const mentionedUser of mentionedUsers) {
        if (mentionedUser._id.toString() !== req.user.id.toString()) {
          await createNotification({
            req,
            receiverId: mentionedUser._id, // ✅ correct
            senderId: req.user.id, // ✅ correct
            type: "mention",
            postId: post._id,
            commentId: comment._id,
            text, // optional: show mention text
            actionLink: `/post/${post._id}?focusCommentId=${comment._id}`,
          });
        }
      }
    }

    res.json(post);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Like/unlike comment or reply
const likeComment = async (req, res) => {
  try {
    const { commentId, replyId } = req.body; // replyId optional
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    if (replyId) {
      const reply = comment.replies.id(replyId);
      if (!reply) return res.status(404).json({ message: "Reply not found" });

      const already = reply.likes.some((u) => u.toString() === req.user.id);
      if (already) {
        reply.likes = reply.likes.filter((u) => u.toString() !== req.user.id);
      } else {
        reply.likes.push(req.user.id);

        // 🔔 Notification to reply owner
        if (reply.user.toString() !== req.user.id.toString()) {
          await createNotification({
            req,
            receiverId: reply.user,
            senderId: req.user.id,
            type: "reply", // normalize to supported type
            postId: post._id,
            commentId: comment._id,
            replyId: reply._id,
            actionLink: `/post/${post._id}?focusCommentId=${comment._id}`,
          });
        }
      }
    } else {
      const already = comment.likes.some((u) => u.toString() === req.user.id);
      if (already) {
        comment.likes = comment.likes.filter(
          (u) => u.toString() !== req.user.id
        );
      } else {
        comment.likes.push(req.user.id);

        // 🔔 Notification to comment owner
        if (comment.user.toString() !== req.user.id.toString()) {
          await createNotification({
            req,
            receiverId: comment.user,
            senderId: req.user.id,
            type: "like", // normalize to supported type
            postId: post._id,
            commentId: comment._id,
            actionLink: `/post/${post._id}?focusCommentId=${comment._id}`,
          });
        }
      }
    }

    await post.save();
    res.json(post);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete a comment
const deleteComment = async (req, res) => {
  try {
    const { id: postId, commentId } = req.params;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    // Only owner of comment or post can delete
    if (
      comment.user.toString() !== req.user.id &&
      post.user.toString() !== req.user.id
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this comment" });
    }

    comment.deleteOne(); // removes from subdocument array
    await post.save();

    res.json({ success: true, message: "Comment deleted successfully", post });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete a reply
const deleteReply = async (req, res) => {
  try {
    const { id: postId, commentId, replyId } = req.params;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const reply = comment.replies.id(replyId);
    if (!reply) return res.status(404).json({ message: "Reply not found" });

    // Only owner of reply or post can delete
    if (
      reply.user.toString() !== req.user.id &&
      post.user.toString() !== req.user.id
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this reply" });
    }

    reply.deleteOne(); // removes from replies array
    await post.save();

    res.json({ success: true, message: "Reply deleted successfully", post });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Edit a comment
const editComment = async (req, res) => {
  try {
    const { id: postId, commentId } = req.params;
    const { text } = req.body;

    if (!text) return res.status(400).json({ message: "Text is required" });

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    if (comment.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    comment.text = text;
    comment.updatedAt = Date.now();

    await post.save();
    res.json(post);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Edit a reply
const editReply = async (req, res) => {
  try {
    const { id: postId, commentId, replyId } = req.params;
    const { text } = req.body;

    if (!text) return res.status(400).json({ message: "Text is required" });

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const reply = comment.replies.id(replyId);
    if (!reply) return res.status(404).json({ message: "Reply not found" });

    if (reply.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    reply.text = text;
    reply.updatedAt = Date.now();

    await post.save();
    res.json(post);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const savePost = async (req, res) => {
  try {
    const { id: postId } = req.params;
    const user = await User.findById(req.user.id);

    if (!user) return res.status(404).json({ message: "User not found" });

    const alreadySaved = user.savedPosts.some((p) => p.toString() === postId);

    if (alreadySaved) {
      user.savedPosts = user.savedPosts.filter((p) => p.toString() !== postId);
    } else {
      user.savedPosts.push(postId);

      // 🔔 Notification to post owner (only if not saving own post)
      const post = await Post.findById(postId).select("user");
      if (post && post.user.toString() !== req.user.id.toString()) {
        await createNotification({
          req,
          receiverId: post.user, // ✅ correct
          senderId: req.user.id, // ✅ correct
          type: "save",
          postId: post._id,
          actionLink: `/post/${post._id}`,
        });
      }
    }

    await user.save();
    res.json({
      success: true,
      message: alreadySaved
        ? "Post removed from saved"
        : "Post saved successfully",
      savedPosts: user.savedPosts,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getSavedPosts = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: "savedPosts",
      populate: [
        { path: "user", select: "name profilePic" },
        { path: "comments.user", select: "name profilePic" },
        { path: "comments.replies.user", select: "name profilePic" },
      ],
    });

    res.json({ success: true, savedPosts: user.savedPosts });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// EXPLORE FEED: basic heuristic combining following, interactions, hashtags, trending
const getExplorePosts = async (req, res) => {
  try {
    const userId = req.user.id
    let { page = 1, limit = 18, lat, lng } = req.query
    page = Number.parseInt(page)
    limit = Math.min(50, Math.max(6, Number.parseInt(limit)))

    // Signals
    const me = await User.findById(userId).select("following savedPosts")
    const following = me?.following || []
    const saved = me?.savedPosts || []

    // Pull recent posts and score
    const recent = await Post.find({}).sort({ createdAt: -1 }).limit(800).populate("user", "name profilePic")

    const userLat = lat != null && lng != null ? Number(lat) : null
    const userLng = lat != null && lng != null ? Number(lng) : null

    const scorePost = (p) => {
      let score = 0
      // Popularity
      score += (p.likes?.length || 0) * 2
      score += (p.comments?.length || 0) * 3
      // Recency
      const ageHours = Math.max(1, (Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60))
      score += 100 / ageHours
      // From following
      if (following.some((f) => String(f) === String(p.user?._id || p.user))) score += 25
      // Saved by me historically -> taste affinity
      if (saved.some((s) => String(s) === String(p._id))) score += 20
      // Hashtag affinity: crude - count hashtags
      score += (p.hashtags?.length || 0) * 1
      // Proximity (if available): within ~50km boosts, inverse with distance
      if (userLat != null && userLng != null && p?.geo?.coordinates?.length === 2) {
        const [plng, plat] = p.geo.coordinates
        const R = 6371 // km
        const dLat = ((plat - userLat) * Math.PI) / 180
        const dLng = ((plng - userLng) * Math.PI) / 180
        const a = Math.sin(dLat / 2) ** 2 + Math.cos((userLat * Math.PI) / 180) * Math.cos((plat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        const distanceKm = R * c
        if (distanceKm < 10) score += 40
        else if (distanceKm < 25) score += 25
        else if (distanceKm < 50) score += 12
      }
      return score
    }

    const scored = recent
      .map((p) => ({ p, s: scorePost(p) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.p)

    const start = (page - 1) * limit
    const data = scored.slice(start, start + limit)
    const hasMore = start + limit < scored.length

    res.json({ success: true, page, limit, hasMore, posts: data })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
}

const getPlaceFeed = async (req, res) => {
  try {
    let { page = 1, limit = 18, name } = req.query
    page = Math.max(1, parseInt(page))
    limit = Math.min(50, Math.max(6, parseInt(limit)))
    if (!name || String(name).trim() === '') return res.status(400).json({ success: false, message: 'Place name required' })
    const rx = new RegExp(String(name).trim(), 'i')
    const filter = { locationName: rx }
    const total = await Post.countDocuments(filter)
    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name profilePic')
    return res.json({ success: true, page, limit, total, totalPages: Math.ceil(total/limit), posts })
  } catch (e) { return res.status(500).json({ success: false, message: e.message }) }
}

const getNearbyFeed = async (req, res) => {
  try {
    let { page = 1, limit = 18, lat, lng, radiusKm = 50 } = req.query
    page = Math.max(1, parseInt(page))
    limit = Math.min(50, Math.max(6, parseInt(limit)))
    const plat = Number(lat), plng = Number(lng), r = Math.max(1, Math.min(200, Number(radiusKm)))
    if (!Number.isFinite(plat) || !Number.isFinite(plng)) return res.status(400).json({ success: false, message: 'lat and lng required' })
    const filter = { geo: { $near: { $geometry: { type: 'Point', coordinates: [plng, plat] }, $maxDistance: r * 1000 } } }
    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name profilePic')
    return res.json({ success: true, page, limit, posts })
  } catch (e) { return res.status(500).json({ success: false, message: e.message }) }
}

const getPostById = async (req, res) => {
  try {
    const { id } = req.params
    const post = await Post.findById(id)
      .populate("user", "name profilePic")
      .populate("comments.user", "name profilePic")
      .populate("comments.replies.user", "name profilePic")
    if (!post) return res.status(404).json({ success: false, message: "Post not found" })
    res.json({ success: true, post })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
}

// REELS feed: video-only posts with improved scoring and diversity for high-quality playback order
const getReels = async (req, res) => {
  try {
    let { page = 1, limit = 8 } = req.query
    page = Number.parseInt(page)
    limit = Math.min(10, Math.max(4, Number.parseInt(limit)))

    const me = await User.findById(req.user.id).select('following savedPosts notInterestedPosts')
    const following = me?.following || []
    const saved = me?.savedPosts || []
    const notInterested = new Set((me?.notInterestedPosts || []).map((x) => String(x)))

    // Pull recent video posts only
    const recent = await Post.find({ mediaUrl: { $regex: /\.(mp4|mov|webm|m4v|m3u8)$/i } })
      .sort({ createdAt: -1 })
      .limit(1000)
      .populate('user', 'name profilePic')

    const HOURS = 1000 * 60 * 60
    const scorePost = (p) => {
      let score = 0
      // Popularity signals
      score += (p.likes?.length || 0) * 3
      score += (p.comments?.length || 0) * 2
      // Recency (prefer newer, but not overly volatile)
      const ageHours = Math.max(1, (Date.now() - new Date(p.createdAt).getTime()) / HOURS)
      // Slightly stronger early decay to surface fresh content; plateau after ~48h
      score += 200 / (1 + ageHours)
      if (ageHours > 72) score -= 20 // soft penalty for very old
      // From following
      if (following.some((f) => String(f) === String(p.user?._id || p.user))) score += 30
      // Saved affinity
      if (saved.some((s) => String(s) === String(p._id))) score += 20
      // Hashtags presence lightly boosts (content richness)
      score += (p.hashtags?.length || 0) * 1
      // Not interested penalty
      if (notInterested.has(String(p._id))) score -= 500
      // Watch metrics (completion, avg watch, rewatch)
      const watchCount = Math.max(1, Number(p.watchCount || 0))
      const impressions = Math.max(1, Number(p.impressions || 0))
      const completionRate = Math.min(1, Number(p.completeCount || 0) / watchCount)
      const avgWatchSeconds = Math.min(60, Number(p.watchMsTotal || 0) / impressions / 1000)
      score += completionRate * 240 // slightly higher weight to completion
      score += avgWatchSeconds * 2.5 // slightly higher weight to avg watch
      score += Math.min(1, Number(p.rewatchCount || 0) / watchCount) * 90
      // Minimum viability gating: deprioritize items with extremely low impressions
      if (impressions < 3 && ageHours > 12) score -= 30
      // Tiny randomization to avoid determinism/ties
      score += Math.random() * 0.5
      return score
    }

    const scoredItems = recent
      .map((p) => ({ p, s: scorePost(p) }))
      .sort((a, b) => b.s - a.s)

    // Diversity: limit long streaks by the same author (e.g., max 2 consecutive)
    const MAX_CONSECUTIVE_PER_AUTHOR = 2
    const arranged = []
    let lastAuthor = null
    let streak = 0
    const delayed = []
    for (const it of scoredItems) {
      const authorId = String(it.p.user?._id || it.p.user || '')
      if (authorId && authorId === lastAuthor && streak >= MAX_CONSECUTIVE_PER_AUTHOR) {
        delayed.push(it)
        continue
      }
      arranged.push(it)
      if (authorId === lastAuthor) streak += 1
      else { lastAuthor = authorId; streak = 1 }
    }
    // Second pass: insert delayed items trying to respect diversity where possible
    for (const it of delayed) {
      const authorId = String(it.p.user?._id || it.p.user || '')
      let placed = false
      for (let i = 0; i <= arranged.length; i++) {
        const prev = arranged[i - 1]?.p
        const next = arranged[i]?.p
        const prevAuthor = prev ? String(prev.user?._id || prev.user || '') : null
        const nextAuthor = next ? String(next.user?._id || next.user || '') : null
        if ((prevAuthor !== authorId) && (nextAuthor !== authorId)) {
          arranged.splice(i, 0, it)
          placed = true
          break
        }
      }
      if (!placed) arranged.push(it)
    }

    const scored = arranged.map((x) => x.p)

    const start = (page - 1) * limit
    const data = scored.slice(start, start + limit)
    const hasMore = start + limit < scored.length

    res.json({ success: true, page, limit, hasMore, posts: data })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
}

// Record aggregated watch metrics for reels/posts
const recordWatchMetric = async (req, res) => {
  try {
    const { id } = req.params
    const { event, positionMs, durationMs, deltaMs } = req.body || {}
    if (!id || !event) return res.status(400).json({ success: false, message: 'id and event are required' })
    const post = await Post.findById(id).select('impressions watchCount completeCount rewatchCount watchMsTotal')
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' })
    switch (String(event)) {
      case 'impression':
        post.impressions = (post.impressions || 0) + 1
        break
      case 'watch_start':
        post.watchCount = (post.watchCount || 0) + 1
        break
      case 'watch_progress': {
        const inc = Number.isFinite(deltaMs) ? Number(deltaMs) : (Number(positionMs) || 0)
        if (inc > 0) post.watchMsTotal = (post.watchMsTotal || 0) + inc
        break
      }
      case 'watch_complete':
        post.completeCount = (post.completeCount || 0) + 1
        // If we have duration, add it to total
        if (Number.isFinite(durationMs) && durationMs > 0) post.watchMsTotal = (post.watchMsTotal || 0) + Number(durationMs)
        break
      case 'rewatch':
        post.rewatchCount = (post.rewatchCount || 0) + 1
        break
      default:
        return res.status(400).json({ success: false, message: 'Unknown event' })
    }
    await post.save()
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
}

// Mark a post as Not Interested for the current user
const markNotInterested = async (req, res) => {
  try {
    const { id } = req.params
    const me = await User.findById(req.user.id).select('notInterestedPosts')
    if (!me) return res.status(404).json({ success: false, message: 'User not found' })
    const exists = (me.notInterestedPosts || []).some((p) => String(p) === String(id))
    if (!exists) me.notInterestedPosts.push(id)
    await me.save()
    return res.json({ success: true })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}

const getFollowingFeed = async (req, res) => {
  try {
    let { page = 1, limit = 10 } = req.query
    page = Math.max(1, parseInt(page))
    limit = Math.min(50, Math.max(1, parseInt(limit)))

    const me = await User.findById(req.user.id).select('following')
    const ids = new Set((me?.following || []).map((x) => String(x)))
    ids.add(String(req.user.id))

    const total = await Post.countDocuments({ user: { $in: Array.from(ids) } })
    const posts = await Post.find({ user: { $in: Array.from(ids) } })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name profilePic')
      .populate('comments.user', 'name profilePic')
      .populate('comments.replies.user', 'name profilePic')

    return res.json({ success: true, page, limit, total, posts })
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message })
  }
}

module.exports = {
  createPost,
  getAllPosts,
  getMyPosts,
  deletePost,
  likePost,
  addComment,
  replyToComment,
  likeComment,
  deleteComment,
  deleteReply,
  editComment,
  editReply,
  savePost,
  getSavedPosts,
  getExplorePosts,
  getPostById,
  getReels,
  markNotInterested,
  recordWatchMetric,
  getFollowingFeed,
  getPlaceFeed,
  getNearbyFeed,
};