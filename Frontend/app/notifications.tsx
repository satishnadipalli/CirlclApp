"use client"

import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useCallback, useEffect, useState } from "react"
import { Alert, FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { type Socket } from "socket.io-client"
import socketService from "@/services/socket.service"

interface User {
  _id: string
  name: string
  profilePic: string
}

interface Post {
  _id: string
  title: string
  mediaUrl: string
}

interface Notification {
  _id: string
  receiver: string
  sender: User | string
  type: "like" | "comment" | "reply" | "follow" | "mention" | "save"
  post?: Post
  comment?: string
  reply?: string
  text?: string
  isRead: boolean
  actionLink?: string
  createdAt: string
  updatedAt: string
}

interface NotificationResponse {
  success: boolean
  total: number
  page: number
  pages: number
  notifications: Notification[]
}

const NotificationsScreen = () => {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const BASE_URL = require("../constants/Config").API_ORIGIN

  const fetchNotifications = async (pageNum = 1, refresh = false) => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token) return

      const data: any = await (await import("@/services/api.service")).apiService.getNotifications(pageNum, 20)

      if (data.success) {
        if (refresh || pageNum === 1) {
          setNotifications(data.notifications)
        } else {
          setNotifications((prev) => [...prev, ...data.notifications])
        }
        setHasMore(pageNum < data.pages)
        setPage(pageNum)
      }
    } catch (error) {
      console.error("Error fetching notifications:", error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const fetchUnreadCount = async () => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token) return

      const data: any = await (await import("@/services/api.service")).apiService.getUnreadNotificationsCount()
      if (data.success) {
        setUnreadCount(data.count)
      }
    } catch (error) {
      console.error("Error fetching unread count:", error)
    }
  }

  const markAsRead = async (notificationId: string) => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token) return

      await (await import("@/services/api.service")).apiService.markNotificationRead(notificationId)

      // Update local state
      setNotifications((prev) =>
        prev.map((notif) => (notif._id === notificationId ? { ...notif, isRead: true } : notif)),
      )

      // Update unread count
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch (error) {
      console.error("Error marking notification as read:", error)
    }
  }

  const markAllAsRead = async () => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token) return

      await (await import("@/services/api.service")).apiService.markAllNotificationsRead()

      // Update local state
      setNotifications((prev) => prev.map((notif) => ({ ...notif, isRead: true })))
      setUnreadCount(0)
    } catch (error) {
      console.error("Error marking all as read:", error)
    }
  }

  const deleteNotification = async (notificationId: string) => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token) return

      await (await import("@/services/api.service")).apiService.deleteNotification(notificationId)

      // Update local state
      setNotifications((prev) => prev.filter((notif) => notif._id !== notificationId))
    } catch (error) {
      console.error("Error deleting notification:", error)
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "like":
        return "heart"
      case "comment":
        return "chatbubble"
      case "reply":
        return "chatbubble-outline"
      case "follow":
        return "person-add"
      case "mention":
        return "at"
      case "save":
        return "bookmark"
      default:
        return "notifications"
    }
  }

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "like":
        return "#FF3040"
      case "comment":
        return "#1DA1F2"
      case "reply":
        return "#1DA1F2"
      case "follow":
        return "#1877F2"
      case "mention":
        return "#8A2BE2"
      case "save":
        return "#FFA500"
      default:
        return "#666"
    }
  }

  const getNotificationText = (notification: Notification) => {
    const { sender, type, post } = notification

    console.log("[v0] Full notification object:", JSON.stringify(notification, null, 2))
    console.log("[v0] Sender object:", sender)
    console.log("[v0] Sender type:", typeof sender)
    console.log("[v0] Sender keys:", sender ? Object.keys(sender) : "sender is null/undefined")

    let senderName = "Someone"

    if (sender) {
      if (typeof sender === "string") {
        // If sender is just an ID string, use it as fallback
        senderName = `User ${sender?.substring(0, 8)}`
      } else if (sender?.name) {
        // If sender is an object with name property
        senderName = sender?.name
      } else if (sender?._id) {
        // If sender is an object but no name, use partial ID
        senderName = `User ${sender?._id.substring(0, 8)}`
      }
    }

    console.log("[v0] Final sender name:", senderName)

    switch (type) {
      case "like":
        return `${senderName} liked your ${post ? "post" : "content"}`
      case "comment":
        return `${senderName} commented on your post`
      case "reply":
        return `${senderName} replied to your comment`
      case "follow":
        return `${senderName} started following you`
      case "mention":
        return `${senderName} mentioned you in a ${post ? "post" : "comment"}`
      case "save":
        return `${senderName} saved your post`
      default:
        return notification.text || `${senderName} interacted with your content`
    }
  }

  const formatTimeAgo = (dateString: string) => {
    const now = new Date()
    const date = new Date(dateString)
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return "now"
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d`
    return `${Math.floor(diffInSeconds / 604800)}w`
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchNotifications(1, true)
    fetchUnreadCount()
  }, [])

  const loadMore = () => {
    if (!loading && hasMore) {
      fetchNotifications(page + 1)
    }
  }

  const handleNotificationPress = (notification: Notification) => {
    if (!notification.isRead) {
      markAsRead(notification._id)
    }
    const pid = (notification?.post as any)?._id
    if (pid) {
      // Try comment focus via actionLink like /post/:id?focusCommentId=... or ?commentId=...
      const link = (notification as any)?.actionLink || ""
      let focusCommentId = ""
      try {
        const m = link.match(/focusCommentId=([a-f0-9]+)/i) || link.match(/commentId=([a-f0-9]+)/i)
        if (m && m[1]) focusCommentId = m[1]
      } catch {}
      const target = focusCommentId ? `/post/${pid}?focusCommentId=${focusCommentId}` : `/post/${pid}`
      try { (require("expo-router") as any).router.push(target) } catch {}
      return
    }
    if (notification.type === 'follow') {
      const uid = typeof notification.sender === 'string' ? notification.sender : (notification.sender as any)?._id
      if (uid) { try { (require("expo-router") as any).router.push(`/otherProfile?userId=${uid}`) } catch {} }
      return
    }
    if (notification.type === 'mention' && !notification.post) {
      const uid = typeof notification.sender === 'string' ? notification.sender : (notification.sender as any)?._id
      if (uid) { try { (require("expo-router") as any).router.push(`/otherProfile?userId=${uid}`) } catch {} }
      return
    }
    // Fallback: no-op
  }

  const handleLongPress = (notification: Notification) => {
    Alert.alert("Notification Options", "What would you like to do?", [
      { text: "Cancel", style: "cancel" },
      {
        text: notification.isRead ? "Mark as Unread" : "Mark as Read",
        onPress: () => markAsRead(notification._id),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteNotification(notification._id),
      },
    ])
  }

  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem("token")
        if (!token) return
        socketService.onNotification((notificationData: any) => {
          setUnreadCount((prev) => prev + 1)
          setTimeout(() => {
            // toasts handled by provider; this screen just bumps badge
          }, 50)
        })
      } catch {}
    })()
    return () => {
      socketService.removeNotificationListener?.(() => {})
    }
  }, [])

  const renderNotification = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.notificationItem, !item?.isRead && styles.unreadNotification]}
      onPress={() => handleNotificationPress(item)}
      onLongPress={() => handleLongPress(item)}
    >
      <View style={styles.avatarContainer}>
        <Image
          source={{
            uri:
              typeof item?.sender === "string"
                ? "/diverse-user-avatars.png"
                : item?.sender?.profilePic || "/diverse-user-avatars.png",
          }}
          style={styles.avatar}
        />
        <View style={[styles.iconBadge, { backgroundColor: getNotificationColor(item?.type) }]}>
          <Ionicons name={getNotificationIcon(item?.type) as any} size={12} color="white" />
        </View>
      </View>

      <View style={styles.contentContainer}>
        <Text style={styles.notificationText}>{getNotificationText(item)}</Text>
        <Text style={styles.timeText}>{formatTimeAgo(item?.createdAt)}</Text>
      </View>

      {item?.post?.mediaUrl && <Image source={{ uri: item?.post.mediaUrl }} style={styles.postThumbnail} />}

      {!item?.isRead && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllAsRead} style={styles.markAllButton}>
            <Text style={styles.markAllText}>Mark all as read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading && notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptySubtitle}>When people interact with you, you'll see it here.</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item._id}
          renderItem={renderNotification}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={notifications.length === 0 ? { flexGrow: 1, justifyContent: 'center', alignItems: 'center' } : undefined}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🔔</Text>
              <Text style={styles.emptyTitle}>You're all caught up</Text>
              <Text style={styles.emptySubtitle}>No new notifications right now.</Text>
            </View>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.2}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop:45
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#000",
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  markAllText: {
    color: "#1877F2",
    fontSize: 14,
    fontWeight: "600",
  },
  listContainer: {
    paddingBottom: 20,
  },
  notificationItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f8f8f8",
  },
  unreadNotification: {
    backgroundColor: "#f8f9ff",
  },
  avatarContainer: {
    position: "relative",
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#f0f0f0",
  },
  iconBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  contentContainer: {
    flex: 1,
    marginRight: 12,
  },
  notificationText: {
    fontSize: 14,
    color: "#000",
    lineHeight: 18,
    marginBottom: 2,
  },
  timeText: {
    fontSize: 12,
    color: "#666",
  },
  postThumbnail: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: "#f0f0f0",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#1877F2",
    marginLeft: 8,
  },
  emptyContainer: { alignItems: 'center', padding: 24 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  emptySubtitle: { fontSize: 14, color: '#666' },
})

export default NotificationsScreen

