"use client"

import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "@react-native-async-storage/async-storage"
import type React from "react"
import { createContext, useContext, useEffect, useRef, useState } from "react"
import { Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { io, type Socket } from "socket.io-client"

const { width } = Dimensions.get("window")

interface NotificationContextType {
  unreadCount: number
  showNotification: (notification: NotificationData) => void
  socket: Socket | null
}

interface NotificationData {
  _id?: string
  receiver?: string
  sender?:
    | {
        _id: string
        name: string
        profilePic?: string
      }
    | string
  senderName?: string
  type: "like" | "comment" | "reply" | "follow" | "mention" | "save"
  post?: {
    _id: string
    title: string
    mediaUrl: string
  }
  comment?: string
  reply?: string
  text?: string
  isRead?: boolean
  actionLink?: string
  createdAt?: string
  updatedAt?: string
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export const useNotification = () => {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error("useNotification must be used within a NotificationProvider")
  }
  return context
}

const AnimatedNotification: React.FC<{
  notification: NotificationData | null
  onDismiss: () => void
}> = ({ notification, onDismiss }) => {
  const slideAnim = useRef(new Animated.Value(-100)).current
  const opacityAnim = useRef(new Animated.Value(0)).current
  const insets = useSafeAreaInsets()

  useEffect(() => {
    console.log("[v0] AnimatedNotification: notification prop changed:", notification ? "EXISTS" : "NULL")
    if (notification) {
      console.log("[v0] AnimatedNotification: notification details:", JSON.stringify(notification, null, 2))
    }
  }, [notification])

  useEffect(() => {
    if (notification) {
      console.log("[v0] AnimatedNotification: Starting animation sequence")
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: insets.top + 10,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start(() => {
        console.log("[v0] AnimatedNotification: Animation completed successfully")
      })

      const timer = setTimeout(() => {
        console.log("[v0] AnimatedNotification: Auto-dismissing after 3 seconds")
        dismissNotification()
      }, 3000)

      return () => clearTimeout(timer)
    }
  }, [notification, insets.top])

  const dismissNotification = () => {
    console.log("[v0] AnimatedNotification: Dismissing notification")
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      console.log("[v0] AnimatedNotification: Dismiss animation completed")
      onDismiss()
    })
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "like":
        return { name: "heart", color: "#FF3040" }
      case "comment":
        return { name: "chatbubble", color: "#1DA1F2" }
      case "reply":
        return { name: "chatbubble-outline", color: "#1DA1F2" }
      case "follow":
        return { name: "person-add", color: "#1877F2" }
      case "mention":
        return { name: "at", color: "#8A2BE2" }
      case "save":
        return { name: "bookmark", color: "#FFA500" }
      default:
        return { name: "notifications", color: "#666" }
    }
  }

  const getNotificationText = (notification: NotificationData) => {
    const { sender, senderName, type, post } = notification

    let displayName = "Someone"

    // First try to use senderName from backend
    if (senderName) {
      displayName = senderName
    } else if (sender) {
      // Fallback to sender object if senderName not available
      if (typeof sender === "string") {
        displayName = `User ${sender.substring(0, 8)}`
      } else if (sender?.name) {
        displayName = sender.name
      } else if (sender?._id) {
        displayName = `User ${sender._id.substring(0, 8)}`
      }
    }

    console.log("[v0] Display name resolved to:", displayName)

    switch (type) {
      case "like":
        return `${displayName} liked your ${post ? "post" : "content"}`
      case "comment":
        return `${displayName} commented on your post`
      case "reply":
        return `${displayName} replied to your comment`
      case "follow":
        return `${displayName} started following you`
      case "mention":
        return `${displayName} mentioned you in a ${post ? "post" : "comment"}`
      case "save":
        return `${displayName} saved your post`
      default:
        return notification.text || `${displayName} interacted with your content`
    }
  }

  if (!notification) {
    console.log("[v0] AnimatedNotification: Returning null - no notification")
    return null
  }

  console.log("[v0] AnimatedNotification: About to render notification UI")
  const iconConfig = getNotificationIcon(notification.type)

  return (
    <Animated.View
      style={[
        styles.notificationContainer,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <View style={{ backgroundColor: "rgba(255, 0, 0, 0.1)", padding: 2 }}>
        <TouchableOpacity style={styles.notificationContent} onPress={dismissNotification} activeOpacity={0.9}>
          <View style={[styles.iconContainer, { backgroundColor: iconConfig.color + "15" }]}>
            <Ionicons name={iconConfig.name as any} size={22} color={iconConfig.color} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.notificationText} numberOfLines={2}>
              {getNotificationText(notification)}
            </Text>
          </View>
          <TouchableOpacity onPress={dismissNotification} style={styles.closeButton}>
            <Ionicons name="close" size={20} color="#999" />
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
    </Animated.View>
  )
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [unreadCount, setUnreadCount] = useState(0)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [currentNotification, setCurrentNotification] = useState<NotificationData | null>(null)

  const BASE_URL = "http://192.168.53.127:5000"

  useEffect(() => {
    initializeSocket()
    fetchUnreadCount()

    return () => {
      if (socket) {
        socket.disconnect()
      }
    }
  }, [])

  const initializeSocket = async () => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token) {
        console.log("[v0] No token found, cannot initialize socket")
        return
      }

      const response = await fetch(`${BASE_URL}/api/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        console.log("[v0] Failed to get user data")
        return
      }

      const userData = await response.json()
      const userId = userData._id
      console.log("[v0] Current user ID:", userId)

      const socketInstance = io(BASE_URL)
      setSocket(socketInstance)

      socketInstance.on("connect", () => {
        console.log("[v0] Socket connected globally, ID:", socketInstance.id)
        console.log("[v0] Registering user:", userId)
        socketInstance.emit("register", userId)
      })

      socketInstance.on("newNotification", (notificationData) => {
        console.log("[v0] ===== NEW NOTIFICATION RECEIVED =====")
        console.log("[v0] Notification data:", JSON.stringify(notificationData, null, 2))
        console.log("[v0] About to call showNotification...")

        setUnreadCount((prev) => {
          console.log("[v0] Updating unread count from", prev, "to", prev + 1)
          return prev + 1
        })

        setTimeout(() => {
          console.log("[v0] Calling showNotification with delay...")
          showNotification(notificationData)
        }, 100)
      })

      socketInstance.on("disconnect", (reason) => {
        console.log("[v0] Socket disconnected globally:", reason)
      })

      socketInstance.on("connect_error", (error) => {
        console.log("[v0] Socket connection error:", error)
      })
    } catch (error) {
      console.error("[v0] Socket initialization error:", error)
    }
  }

  const fetchUnreadCount = async () => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token) return

      const response = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setUnreadCount(data.count || 0)
      }
    } catch (error) {
      console.error("[v0] Error fetching unread count:", error)
    }
  }

  const showNotification = (notification: NotificationData) => {
    console.log("[v0] ===== SHOW NOTIFICATION CALLED =====")
    console.log("[v0] Notification data:", JSON.stringify(notification, null, 2))
    console.log("[v0] Current notification state before update:", currentNotification)

    setCurrentNotification(null)

    setTimeout(() => {
      console.log("[v0] Setting new notification after clearing previous one")
      setCurrentNotification(notification)
    }, 50)
  }

  const dismissCurrentNotification = () => {
    console.log("[v0] NotificationProvider: dismissCurrentNotification called")
    setCurrentNotification(null)
  }

  console.log("[v0] NotificationProvider RENDER - currentNotification exists:", !!currentNotification)
  if (currentNotification) {
    console.log("[v0] NotificationProvider RENDER - notification type:", currentNotification.type)
  }

  return (
    <NotificationContext.Provider value={{ unreadCount, showNotification, socket }}>
      {children}
      {console.log("[v0] About to render AnimatedNotification component")}
      <AnimatedNotification notification={currentNotification} onDismiss={dismissCurrentNotification} />
    </NotificationContext.Provider>
  )
}

const styles = StyleSheet.create({
  notificationContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: 12,
    pointerEvents: "box-none",
  },
  notificationContent: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.05)",
    marginHorizontal: 4,
    pointerEvents: "auto",
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  textContainer: {
    flex: 1,
  },
  notificationText: {
    fontSize: 15,
    color: "#1a1a1a",
    fontWeight: "600",
    lineHeight: 20,
  },
  closeButton: {
    padding: 6,
    marginLeft: 10,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
  },
})
