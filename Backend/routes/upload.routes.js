const express = require("express");
const router = express.Router();
const upload = require("../middlewares/upload.middleware");
const protect = require("../middlewares/auth.middleware");
const User = require("../models/user.models")

router.post("/", protect, upload.single("file"), async (req, res) => {
  try {
    // Save Cloudinary URL to user's profile
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { profilePic: req.file.path },
      { new: true, select: "-password" }
    );

    res.json({
      message: "Profile picture updated successfully",
      user: updatedUser
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
