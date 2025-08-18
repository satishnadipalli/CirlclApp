const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "circle_uploads", // folder name in Cloudinary
    allowed_formats: ["jpg", "png", "jpeg", "gif", "mp4"], // allow images/videos
  },
});

const upload = multer({ storage });

module.exports = upload;
