const uploadToCloudinary = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    req.fileUrl = req.file.path; // Cloudinary URL
    try {
      // Optional basic moderation flags via Cloudinary result (if enabled)
      // You can extend this with Vision/Moderation providers in a worker.
      if (process.env.MODERATION_BLOCK_ALL === 'true') {
        return res.status(422).json({ message: 'Content under review' })
      }
    } catch {}
    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { uploadToCloudinary };
