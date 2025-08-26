import AsyncStorage from "@react-native-async-storage/async-storage";
import { io } from "socket.io-client";

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;

    this.messageListeners = [];
    this.directMessageListeners = [];
    this.groupMessageListeners = [];
    this.typingListeners = [];
    this.stopTypingListeners = [];
    this.userStatusListeners = [];
    this.notificationListeners = [];
    this.followEventListeners = [];
    this.dailyPostedListeners = [];
    this.dailyRingListeners = [];
    this.dailyViewedListeners = [];
    this.messageReactionListeners = [];
    this.messageDeleteListeners = [];
    this.messageEditListeners = [];
    this.messageReadListeners = [];
    this.currentUserId = null;
    this.heartbeatInterval = null as any;
    this.clientPrivacy = { sendTypingIndicators: true } as any
  }

  async connect() {
    if (this.socket?.connected) {
      console.log("[v0] Socket already connected:", this.socket.id);
      return;
    }

    const token = await AsyncStorage.getItem("token");

    if (!this.socket) {
      this.socket = io(require("../constants/Config").API_ORIGIN, {
        auth: { token },
        transports: ["websocket"],
        timeout: 20000,
        forceNew: false, // ✅ important
      });

      this.setupEventListeners();
    }

    return new Promise((resolve, reject) => {
      this.socket.on("connect", () => {
        console.log("[v0] Socket connected:", this.socket?.id);
        this.isConnected = true;
        // Start heartbeat (every 30s)
        try { if (this.heartbeatInterval) clearInterval(this.heartbeatInterval) } catch {}
        try { this.heartbeatInterval = setInterval(() => { try { (this.socket as any)?.emit('heartbeat') } catch {} }, 30000) } catch {}
        resolve();
      });
      this.socket.on("connect_error", (err) => {
        console.error("[v0] Socket connect error:", err);
        this.isConnected = false;
        reject(err);
      });
    });
  }

  setupEventListeners() {
    if (!this.socket) return;

    this.socket.on("disconnect", (reason) => {
      // Ignore disconnects caused by leaving a room
      if (reason === "io client disconnect") return;

      console.log("[v0] Socket disconnected:", reason);
      this.isConnected = false;
      try { if (this.heartbeatInterval) clearInterval(this.heartbeatInterval) } catch {}

      if (reason === "io server disconnect") {
        this.handleReconnection();
      }
    });

    this.socket.on("reconnect", (attemptNumber) => {
      console.log("[v0] Socket reconnected after", attemptNumber, "attempts");
      this.isConnected = true;
      this.reconnectAttempts = 0;
      try { if (this.heartbeatInterval) clearInterval(this.heartbeatInterval) } catch {}
      try { this.heartbeatInterval = setInterval(() => { try { (this.socket as any)?.emit('heartbeat') } catch {} }, 30000) } catch {}
    });

    this.socket.on("reconnect_error", (error) => {
      console.error("[v0] Socket reconnection error:", error);
      this.handleReconnection();
    });

    // Message events
    this.socket.on("receiveDirectMessage", (message) => {
      console.log("[v0] Received direct message:", message);
      // Generic listeners (used by chat detail screen)
      this.messageListeners.forEach((listener) => listener(message));
      // Direct-only listeners (used by chat list screen)
      this.directMessageListeners.forEach((listener) => listener(message));
    });

    this.socket.on("receiveGroupMessage", (message) => {
      console.log("[v0] Received group message:", message);
      // Generic listeners (used by chat detail screen)
      this.messageListeners.forEach((listener) => listener(message));
      // Group-only listeners (used by chat list screen)
      this.groupMessageListeners.forEach((listener) => listener(message));
    });

    // Typing events
    this.socket.on("typing", (data) => {
      this.typingListeners.forEach((listener) => listener(data));
    });

    this.socket.on("stopTyping", (data) => {
      this.stopTypingListeners.forEach((listener) => listener(data));
    });

    this.socket.on("groupTyping", (data) => {
      const normalized = {
        from: data?.userId ?? data?.from,
        name: data?.userName ?? data?.name,
        groupId: data?.groupId,
      };
      this.typingListeners.forEach((listener) => listener(normalized));
    });

    this.socket.on("groupStopTyping", (data) => {
      const normalized = {
        from: data?.userId ?? data?.from,
        groupId: data?.groupId,
      };
      this.stopTypingListeners.forEach((listener) => listener(normalized));
    });

    // User status events
    this.socket.on("userStatusChange", (data) => {
      this.userStatusListeners.forEach((listener) => listener(data));
    });

    // Notification events
    this.socket.on("newNotification", (notification) => {
      this.notificationListeners.forEach((listener) => listener(notification));
    });

    // Daily Circle events
    this.socket.on("dailyPosted", (data) => {
      this.dailyPostedListeners.forEach((listener) => listener(data));
    });
    this.socket.on("dailyRing", (data) => {
      this.dailyRingListeners.forEach((listener) => listener(data));
    });
    this.socket.on("dailyViewed", (data) => {
      this.dailyViewedListeners.forEach((listener) => listener(data));
    });

    // Follow/unfollow events
    this.socket.on("newFollower", (data) => {
      this.followEventListeners.forEach((listener) => listener({ type: "follow", data }));
    });
    this.socket.on("unfollowed", (data) => {
      this.followEventListeners.forEach((listener) => listener({ type: "unfollow", data }));
    });

    // Message meta events
    this.socket.on("messageReactionsUpdated", (payload) => {
      this.messageReactionListeners.forEach((l) => l(payload));
    });
    this.socket.on("messageDeleted", (payload) => {
      this.messageDeleteListeners.forEach((l) => l(payload));
    });
    this.socket.on("messageEdited", (payload) => {
      this.messageEditListeners.forEach((l) => l(payload));
    });
    this.socket.on("messagesRead", (payload) => {
      this.messageReadListeners.forEach((l) => l(payload));
    });

    this.socket.on("connect", () => {
      console.log("[v0] Socket connected:", this.socket.id);
      this.isConnected = true;
      if (this.currentUserId) this.registerUser(this.currentUserId);
      try { if (this.heartbeatInterval) clearInterval(this.heartbeatInterval) } catch {}
      try { this.heartbeatInterval = setInterval(() => { try { (this.socket as any)?.emit('heartbeat') } catch {} }, 30000) } catch {}
    });
  }

  handleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[v0] Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => {
      console.log(
        `[v0] Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
      );
      this.connect().catch((error) => {
        console.error("[v0] Reconnection failed:", error);
        this.handleReconnection();
      });
    }, delay);
  }

  // Update the auth token used for the Socket.io handshake and seamlessly reconnect
  updateAuthToken(token: string) {
    if (!this.socket) return;
    try {
      (this.socket as any).auth = { token };
      if (this.socket.connected) {
        try { this.socket.disconnect(); } catch {}
        try { this.socket.connect(); } catch {}
      }
    } catch {}
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      // Clear all listeners to avoid duplicate callbacks on next mount
      this.clearAllListeners();
      try { if (this.heartbeatInterval) clearInterval(this.heartbeatInterval) } catch {}
    }
  }

  isSocketConnected() {
    return this.isConnected && this.socket?.connected === true;
  }

  // register
  registerUser(userId) {
    this.currentUserId = userId;
    if (this.socket?.connected) {
      this.socket.emit("register", userId); // plain value
    }
  }

  // direct
  sendDirectMessage(toUserId, text, replyTo) {
    this.socket?.emit("sendMessage", { to: toUserId, text, replyTo });
  }

  // groups
  joinGroup(groupId) {
    this.socket?.emit("joinGroup", groupId); // backend expects raw id
  }
  leaveGroup(groupId) {
    this.socket?.emit("leaveGroup", groupId);
  }
  sendGroupMessage(groupId, text, replyTo) {
    this.socket?.emit("sendGroupMessage", { groupId, text, senderId: this.currentUserId, replyTo });
  }

  // typing (direct)
  sendTyping(toUserId, fromUserId, fromName) {
    if (this.clientPrivacy?.sendTypingIndicators === false) return
    this.socket?.emit("typing", {
      to: toUserId,
      from: fromUserId,
      name: fromName,
    });
  }
  sendStopTyping(toUserId, fromUserId) {
    if (this.clientPrivacy?.sendTypingIndicators === false) return
    this.socket?.emit("stopTyping", { to: toUserId, from: fromUserId });
  }

  // typing (group)
  sendGroupTyping(groupId, fromUserId, fromName) {
    if (this.clientPrivacy?.sendTypingIndicators === false) return
    this.socket?.emit("groupTyping", {
      groupId,
      userId: fromUserId,
      userName: fromName,
    });
  }
  sendGroupStopTyping(groupId, fromUserId) {
    if (this.clientPrivacy?.sendTypingIndicators === false) return
    this.socket?.emit("groupStopTyping", { groupId, userId: fromUserId });
  }

  // Update local client privacy (used to avoid emitting typing)
  setClientPrivacy(p) {
    this.clientPrivacy = { ...(this.clientPrivacy || {}), ...(p || {}) }
  }

  // (duplicate method removed)

  // Event listeners
  onMessage(callback) {
    this.messageListeners.push(callback);
  }

  // Chat list specific listeners
  onReceiveDirectMessage(callback) {
    this.directMessageListeners.push(callback);
  }

  onReceiveGroupMessage(callback) {
    this.groupMessageListeners.push(callback);
  }

  onTyping(callback) {
    this.typingListeners.push(callback);
  }

  onStopTyping(callback) {
    this.stopTypingListeners.push(callback);
  }

  onUserStatusChange(callback) {
    this.userStatusListeners.push(callback);
  }

  onNotification(callback) {
    this.notificationListeners.push(callback);
  }

  // Daily listeners
  onDailyPosted(callback) {
    this.dailyPostedListeners.push(callback);
  }
  onDailyRing(callback) {
    this.dailyRingListeners.push(callback);
  }
  onDailyViewed(callback) { this.dailyViewedListeners.push(callback); }

  onFollowEvent(callback) {
    this.followEventListeners.push(callback);
  }

  onMessageReactionsUpdated(cb) { this.messageReactionListeners.push(cb); }
  onMessageDeleted(cb) { this.messageDeleteListeners.push(cb); }
  onMessageEdited(cb) { this.messageEditListeners.push(cb); }
  onMessagesRead(cb) { this.messageReadListeners.push(cb); }

  onGroupTyping(callback) {
    this.typingListeners.push(callback);
  }

  onGroupStopTyping(callback) {
    this.stopTypingListeners.push(callback);
  }

  // Remove listeners
  removeMessageListener(callback) {
    const index = this.messageListeners.indexOf(callback);
    if (index > -1) {
      this.messageListeners.splice(index, 1);
    }
  }

  removeDirectMessageListener(callback) {
    const index = this.directMessageListeners.indexOf(callback);
    if (index > -1) {
      this.directMessageListeners.splice(index, 1);
    }
  }

  removeGroupMessageListener(callback) {
    const index = this.groupMessageListeners.indexOf(callback);
    if (index > -1) {
      this.groupMessageListeners.splice(index, 1);
    }
  }

  removeTypingListener(callback) {
    const index = this.typingListeners.indexOf(callback);
    if (index > -1) {
      this.typingListeners.splice(index, 1);
    }
  }

  removeStopTypingListener(callback) {
    const index = this.stopTypingListeners.indexOf(callback);
    if (index > -1) {
      this.stopTypingListeners.splice(index, 1);
    }
  }

  removeUserStatusListener(callback) {
    const index = this.userStatusListeners.indexOf(callback);
    if (index > -1) {
      this.userStatusListeners.splice(index, 1);
    }
  }

  removeNotificationListener(callback) {
    const index = this.notificationListeners.indexOf(callback);
    if (index > -1) this.notificationListeners.splice(index, 1);
  }

  removeDailyPostedListener(callback) {
    const index = this.dailyPostedListeners.indexOf(callback);
    if (index > -1) this.dailyPostedListeners.splice(index, 1);
  }
  removeDailyRingListener(callback) {
    const index = this.dailyRingListeners.indexOf(callback);
    if (index > -1) this.dailyRingListeners.splice(index, 1);
  }

  removeFollowEventListener(callback) {
    const index = this.followEventListeners.indexOf(callback);
    if (index > -1) this.followEventListeners.splice(index, 1);
  }

  removeMessageReactionsUpdated(cb) { const i = this.messageReactionListeners.indexOf(cb); if (i>-1) this.messageReactionListeners.splice(i,1); }
  removeMessageDeleted(cb) { const i = this.messageDeleteListeners.indexOf(cb); if (i>-1) this.messageDeleteListeners.splice(i,1); }
  removeMessageEdited(cb) { const i = this.messageEditListeners.indexOf(cb); if (i>-1) this.messageEditListeners.splice(i,1); }
  removeMessagesRead(cb) { const i = this.messageReadListeners.indexOf(cb); if (i>-1) this.messageReadListeners.splice(i,1); }

  // Clear all listeners
  clearAllListeners() {
    this.messageListeners = [];
    this.directMessageListeners = [];
    this.groupMessageListeners = [];
    this.typingListeners = [];
    this.stopTypingListeners = [];
    this.userStatusListeners = [];
    this.notificationListeners = [];
    this.followEventListeners = [];
    this.dailyPostedListeners = [];
    this.dailyRingListeners = [];
    this.dailyViewedListeners = [];
    this.messageReactionListeners = [];
    this.messageDeleteListeners = [];
    this.messageEditListeners = [];
    this.messageReadListeners = [];
  }
}

const socketService = new SocketService();

export { socketService };
export default socketService;
