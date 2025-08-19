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
    this.currentUserId = null;
  }

  async connect() {
    if (this.socket?.connected) {
      console.log("[v0] Socket already connected:", this.socket.id);
      return;
    }

    const token = await AsyncStorage.getItem("token");

    if (!this.socket) {
      this.socket = io("http://192.168.140.127:5000", {
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

      if (reason === "io server disconnect") {
        this.handleReconnection();
      }
    });

    this.socket.on("reconnect", (attemptNumber) => {
      console.log("[v0] Socket reconnected after", attemptNumber, "attempts");
      this.isConnected = true;
      this.reconnectAttempts = 0;
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

    this.socket.on("connect", () => {
      console.log("[v0] Socket connected:", this.socket.id);
      this.isConnected = true;
      if (this.currentUserId) this.registerUser(this.currentUserId);
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

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      // Clear all listeners to avoid duplicate callbacks on next mount
      this.clearAllListeners();
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
    this.socket?.emit("typing", {
      to: toUserId,
      from: fromUserId,
      name: fromName,
    });
  }
  sendStopTyping(toUserId, fromUserId) {
    this.socket?.emit("stopTyping", { to: toUserId, from: fromUserId });
  }

  // typing (group)
  sendGroupTyping(groupId, fromUserId, fromName) {
    this.socket?.emit("groupTyping", {
      groupId,
      userId: fromUserId,
      userName: fromName,
    });
  }
  sendGroupStopTyping(groupId, fromUserId) {
    this.socket?.emit("groupStopTyping", { groupId, userId: fromUserId });
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

  // Clear all listeners
  clearAllListeners() {
    this.messageListeners = [];
    this.directMessageListeners = [];
    this.groupMessageListeners = [];
    this.typingListeners = [];
    this.stopTypingListeners = [];
    this.userStatusListeners = [];
  }
}

const socketService = new SocketService();

export { socketService };
export default socketService;
