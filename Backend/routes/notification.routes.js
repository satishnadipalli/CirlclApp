const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notification.controllers");
const protect = require("../middlewares/auth.middleware");

router.get("/", protect, notificationController.getNotifications);

// Get unread count
router.get("/unread-count", protect, notificationController.getUnreadCount);

// Mark single/multiple notifications as read
router.put("/:id/read", protect, notificationController.markAsRead);

// Mark all notifications as read
router.put("/read-all", protect, notificationController.markAllAsRead);

// Delete a notification
router.delete("/:id", protect, notificationController.deleteNotification);
module.exports = router;
