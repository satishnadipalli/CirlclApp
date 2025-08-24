// utils/functions.js
const Notification = require("../models/notification.model");
const User = require("../models/user.models"); // to fetch sender name
const { sendExpoPush } = require("./push");

/**
 * Create a notification and emit it to the receiver if online.
 * @param {Object} params
 * @param {Object} params.req - Express request object (needed for io & onlineUsers)
 * @param {String} params.receiverId - MongoDB _id of the receiver
 * @param {String} params.senderId - MongoDB _id of the sender
 * @param {String} params.type - Type of notification: like, comment, reply, mention, save
 * @param {String} [params.postId] - Related post
 * @param {String} [params.commentId] - Related comment
 * @param {String} [params.replyId] - Related reply
 * @param {String} [params.text] - Optional text content
 * @param {String} [params.actionLink] - Optional link for frontend navigation
 */
const createNotification = async ({
  req,
  receiverId,
  senderId,
  type,
  postId = null,
  commentId = null,
  replyId = null,
  text = "",
  actionLink = ""
}) => {
  if (!receiverId || !senderId) {
    console.log("Notification skipped: receiver or sender missing");
    return;
  }

  const io = req.app.get("io");
  const onlineUsers = req.app.get("onlineUsers");

  // Read receiver preferences
  let allowType = true
  try {
    const prefUser = await User.findById(receiverId).select('notificationPrefs')
    const prefs = prefUser?.notificationPrefs || {}
    allowType = prefs?.[String(type)] !== false // default true
  } catch { allowType = true }
  if (!allowType) return null

  const newNotif = await Notification.create({
    receiver: receiverId,
    sender: senderId,
    type,
    post: postId,
    comment: commentId,
    reply: replyId,
    text,
    isRead: false,
    actionLink
  });

  // Get sender name for human-readable message
  const sender = await User.findById(senderId).select("name");

  const socketId = onlineUsers.get(receiverId.toString());
  if (socketId) {
    const notifText =
      type === "mention"
        ? `${sender?.name || "Someone"} mentioned you: "${text}"`
        : type === "like"
        ? `${sender?.name || "Someone"} liked your post`
        : type === "comment"
        ? `${sender?.name || "Someone"} commented on your post`
        : type === "reply"
        ? `${sender?.name || "Someone"} replied to your comment`
        : type === "save"
        ? `${sender?.name || "Someone"} saved your post`
        : `${sender?.name || "Someone"} did ${type} action`;

    io.to(socketId).emit("newNotification", {
      _id: newNotif._id,
      text: notifText,
      senderName: sender?.name,
      type: newNotif.type,
      actionLink: newNotif.actionLink,
      postId,
      commentId,
      replyId,
      createdAt: newNotif.createdAt
    });
  }

  // Best-effort Expo push (also respect prefs for the type)
  try {
    const receiver = await User.findById(receiverId).select('expoPushTokens notificationPrefs')
    const tokens = receiver?.expoPushTokens || []
    const prefs = receiver?.notificationPrefs || {}
    if (tokens?.length && (prefs?.[String(type)] !== false)) {
      const title = sender?.name || 'Someone'
      const body = type === 'mention' && text ? `mentioned you: "${text}"` :
        type === 'like' ? 'liked your post' :
        type === 'comment' ? 'commented on your post' :
        type === 'reply' ? 'replied to your comment' :
        type === 'save' ? 'saved your post' : 'interacted with you'
      await sendExpoPush({ tokens, title, body, data: { type, postId, commentId, replyId, actionLink } })
    }
  } catch {}

  return newNotif;
};

module.exports = { createNotification };
