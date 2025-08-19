const Post = require("../models/post.model");
const User = require("../models/user.models");
const Notification = require("../models/notification.model");
const { createNotification } = require("../utils/functions");
// const { io, onlineUsers } = require("../server"); // import here only

const extractTags = (text = "") => {
  const hashtags = (text.match(/#\w+/g) || []).map((tag) =>
    tag.substring(1).toLowerCase()
  );
  const mentions = (text.match(/@\w+/g) || []).map((tag) =>
    tag.substring(1).toLowerCase()
  );
  return { hashtags, mentions };
};

const createPost = async (req, res) => {
  try {
    const { title, description = "" } = req.body
    if (!title) return res.status(400).json({ message: "Title is required" })

    const hashtags = (description.match(/#\w+/g) || []).map((t) => t.substring(1).toLowerCase())
    const mentions = (description.match(/@\w+/g) || []).map((u) => u.substring(1))

    const newPost = await Post.create({
      title,
      description,
      mediaUrl: req.fileUrl, // Save the Cloudinary URL from uploadToCloudinary middleware
      user: req.user._id,
      hashtags,
      mentions,
    })

    if (mentions.length > 0) {
      console.log("mentions", mentions)

      const mentionedUsers = await User.find({
        name: { $in: mentions.map((m) => new RegExp(`^${m}$`, "i")) },
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
  console.log("jjj")

  const {userId} = req.query;

  // console.log(userId,req.)
  try {
    let { page = 1, limit = 10, hashtag, mention } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const filter = {};

    // If ?hashtag=nature is passed, filter posts with that hashtag
    if (hashtag) {
      filter.hashtags = hashtag.toLowerCase();
    }

    // If ?mention=name is passed, filter posts mentioning that user
    if (mention) {
      filter.mentions = mention;
    }

    const totalPosts = await Post.countDocuments(filter);

    const posts = await Post.find({user:userId})
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
    page = Number.parseInt(page)
    limit = Number.parseInt(limit)

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

    const username = req.user.name // Get current user's name
    const mentionedPosts = await Post.find({
      mentions: { $regex: new RegExp(`^${username}$`, "i") }, // Case-insensitive search
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
    page = Number.parseInt(page)
    limit = Number.parseInt(limit)

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
      });
    }

    // 🔔 Notifications for mentions in comment
    if (mentions.length > 0) {
      // Match users case-insensitively
      const mentionedUsers = await User.find({
        name: { $in: mentions.map((n) => new RegExp(`^${n}$`, "i")) },
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
    const mentions = (text.match(/@\w+/g) || []).map((m) => m.slice(1));

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
      });
    }

    // 🔔 Mention notifications in reply
    if (mentions.length > 0) {
      const mentionedUsers = await User.find({
        name: { $in: mentions.map((m) => new RegExp(`^${m}$`, "i")) },
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
};
