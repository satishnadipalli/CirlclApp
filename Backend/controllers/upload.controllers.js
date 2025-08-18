const uploadToCloudinary = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    req.fileUrl = req.file.path; // Cloudinary URL
    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { uploadToCloudinary };
