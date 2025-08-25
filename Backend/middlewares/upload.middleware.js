const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "circle_uploads", // folder name in Cloudinary
    allowed_formats: ["jpg", "png", "jpeg", "gif", "mp4", "mov", "webm", "mp3", "m4a", "wav", "ogg", "aac"], // allow images/videos/audio
    resource_type: "auto",
  },
});

const fileFilter = (req, file, cb) => {
  const ok = /^(image|video|audio)\//.test(file.mimetype)
  if (!ok) return cb(new Error("Unsupported file type"))
  cb(null, true)
}

const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 }, fileFilter });

module.exports = upload;
