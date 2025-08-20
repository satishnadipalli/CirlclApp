const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "circle_uploads", // folder name in Cloudinary
    allowed_formats: ["jpg", "png", "jpeg", "gif", "mp4", "mov", "webm"], // allow images/videos
    resource_type: "auto",
  },
});

const upload = multer({ storage });

module.exports = upload;
