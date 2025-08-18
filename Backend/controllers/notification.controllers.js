const Notification = require("../models/notification.model");

const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const notifications = await Notification.find({ receiver: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate("sender", "name profilePic")
      .populate("post", "title mediaUrl");

    const total = await Notification.countDocuments({ receiver: req.user._id });

    res.json({
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      notifications
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get unread count
const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ receiver: req.user._id, isRead: false });
    res.json({ success: true, count });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Mark single or multiple notifications as read
const markAsRead = async (req, res) => {
  try {
    const { ids } = req.body;

    if (ids?.length) {
      await Notification.updateMany(
        { _id: { $in: ids }, receiver: req.user._id },
        { $set: { isRead: true } }
      );
    } else if (req.params.id) {
      await Notification.updateOne(
        { _id: req.params.id, receiver: req.user._id },
        { $set: { isRead: true } }
      );
    } else {
      await Notification.updateMany(
        { receiver: req.user._id, isRead: false },
        { $set: { isRead: true } }
      );
    }

    res.json({ success: true, message: "Notifications marked as read" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Mark all as read explicitly
const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { receiver: req.user._id, isRead: false },
      { $set: { isRead: true } }
    );
    res.json({ success: true, message: "All notifications marked as read" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Delete a notification
const deleteNotification = async (req, res) => {
  try {
    await Notification.deleteOne({ _id: req.params.id, receiver: req.user._id });
    res.json({ success: true, message: "Notification deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification
};
