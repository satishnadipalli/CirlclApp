const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user.models");

// Register
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

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

    console.log(email,password);
    // Find the user by email
    const user = await User.findOne({ email });
    console.log(user)
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Check if password matches
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Send back token + user info
    res.json({
      token,
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

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

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
    const socketId = onlineUsers.get(userToUnfollow._id.toString());
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
    const { q } = req.query;
    let page = Number.parseInt(req.query.page) || 1
    let limit = Number.parseInt(req.query.limit) || 10
    if (limit > 50) limit = 50
    if (limit < 1) limit = 10

    console.log(q);

    if (!q || q.trim() === "") {
      return res.json({ success: true, users: [] });
    }

    const regex = new RegExp(q, "i"); // case-insensitive regex

    const users = await User.find({ name: regex })
      .select("_id name username profilePic")
      .skip((page - 1) * limit)
      .limit(limit);

      
      console.log(users)

    res.json({ success: true, users, page, limit });
  } catch (err) {
    console.error("Search user error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const { id } = req.params; // directly extract the id from the route params

    if (!id) {
      return res.status(400).json({ success: false, message: "User ID is required" });
    }

    const user = await User.findById(id).select("_id name profilePic bio followers following");

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

module.exports = {
  register,
  login,
  getProfile,
  followUser,
  unfollowUser,
  searchuser,
  getUserById,
  getFollowers,
  getFollowing,
};