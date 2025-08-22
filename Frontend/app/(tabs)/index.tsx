"use client"

import CommentModal from "@/components/CommentModal"
import api from "@/services/api.service"
import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { LinearGradient } from "expo-linear-gradient"
import { useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { Dimensions, FlatList, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import socketService from "@/services/socket.service"
import logo from "../../assets/images/circle-full.png"
import DailyRing from "@/components/DailyRing"
const { width } = Dimensions.get("window")

export default function HomeScreen() {
  const [selectedPost, setSelectedPost] = useState(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [socket, setSocket] = useState(null)
  const [daily, setDaily] = useState<{ prompt?: any; posted?: boolean; streak?: any; rings?: any[] } | null>(null)
  const [countdown, setCountdown] = useState<string>("")
  const [myDaily, setMyDaily] = useState<any>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const router = useRouter()

  const BASE_URL = require("../../constants/Config").API_ORIGIN

  const fetchUnreadCount = async () => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token) return

      const response = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await response.json()
      if (data.success) {
        setUnreadCount(data.count)
      }
    } catch (error) {
      console.error("Error fetching unread count:", error)
    }
  }

  const initializeSocket = async () => {
    try {
      await socketService.connect()
      socketService.onNotification(() => setUnreadCount((prev) => prev + 1))
    } catch (error) {
      console.error("Error initializing socket:", error)
    }
  }

  useEffect(() => {
    ;(async () => {
      try {
        const u = await AsyncStorage.getItem("user")
        if (u) setCurrentUserId(JSON.parse(u)?.id || null)
      } catch {}
    })()
    fetchUnreadCount()
    initializeSocket()
    loadDaily()

    // Live updates for Daily Circle
    const onPosted = (data: any) => {
      loadDaily()
      loadMyDaily()
    }
    const onRing = (ring: any) => {
      setDaily((prev) => {
        if (!prev) return prev
        const rings = Array.isArray(prev.rings) ? prev.rings : []
        if (rings.some((r: any) => r?.user?._id === ring?.user?._id)) return prev
        return { ...prev, rings: [ring, ...rings].slice(0, 30) }
      })
    }
    socketService.onDailyPosted(onPosted)
    socketService.onDailyRing(onRing)

    return () => {
      socketService.removeDailyPostedListener(onPosted)
      socketService.removeDailyRingListener(onRing)
    }
  }, [])

  const loadDaily = async () => {
    try {
      const [p, s, r] = await Promise.all([api.getDailyPrompt(), api.getDailyStreak(), api.getDailyRings()])
      setDaily({ prompt: (p as any)?.prompt, posted: (p as any)?.posted, streak: (s as any)?.streak, rings: (r as any)?.rings || [] })
      updateCountdown((p as any)?.prompt?.dropsAt)
      if ((p as any)?.posted) {
        loadMyDaily()
      }
    } catch {}
  }

  const loadMyDaily = async () => {
    try {
      let uid = currentUserId
      if (!uid) {
        const u = await AsyncStorage.getItem("user")
        uid = u ? JSON.parse(u)?.id : null
      }
      if (!uid) return
      const res: any = await api.getDailyEntryByUser(uid)
      if (res?.success) setMyDaily(res.entry)
    } catch {}
  }

  const updateCountdown = (dropsAt?: string) => {
    if (!dropsAt) { setCountdown(""); return }
    try {
      const nowMs = Date.now()
      let end = new Date(dropsAt).getTime()
      if (!Number.isFinite(end)) { setCountdown(""); return }
      // If today's drop time has passed, roll to next day same time
      if (nowMs >= end) end = end + 24 * 60 * 60 * 1000
      let diff = Math.floor((end - nowMs) / 1000)
      if (diff <= 0) { setCountdown(""); return }
      const h = Math.floor(diff / 3600); diff -= h * 3600
      const m = Math.floor(diff / 60); diff -= m * 60
      const s = diff
      setCountdown(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    } catch { setCountdown("") }
  }

  useEffect(() => {
    const id = setInterval(() => updateCountdown(daily?.prompt?.dropsAt), 1000)
    return () => clearInterval(id)
  }, [daily?.prompt?.dropsAt])

  const openComments = (post) => {
    setSelectedPost(post)
    setModalVisible(true)
  }

  const closeComments = () => {
    setSelectedPost(null)
    setModalVisible(false)
  }

  const handleNotificationPress = () => {
    router.push("/notifications")
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#fafafa" }}>
      <FlatList
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Image source={logo} resizeMethod="contain" style={styles.logo} />
              <TouchableOpacity style={styles.notificationButton} onPress={handleNotificationPress}>
                <Ionicons name="heart-outline" size={28} color="#262626" />
                {unreadCount > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.storiesContainer}>
              {/* Daily Circle banner */}
              {daily?.prompt && (
                <TouchableOpacity
                  style={{
                    backgroundColor: "#fff",
                    borderWidth: 0,
                    borderRadius: 14,
                    padding: 0,
                    marginBottom: 12,
                    overflow: 'hidden',
                  }}
                  onPress={() => router.push({ pathname: "/(tabs)/search", params: { focusDaily: "1", openComposer: daily?.posted ? "0" : "1" } })}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8 }}>
                    <Text style={{ fontWeight: "800", fontSize: 18 }}>Daily Circle</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <View style={{ backgroundColor: daily.posted ? "#e8f5e9" : "#fdecea", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 }}>
                        <Text style={{ color: daily.posted ? "#2e7d32" : "#c62828", fontWeight: "700" }}>
                          {daily.posted && typeof daily.streak?.current === 'number' ? `Streak ${daily.streak.current}` : "Post to unlock"}
                        </Text>
                      </View>
                      {!!countdown && (
                        <View style={{ backgroundColor: "#eef2ff", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6, maxWidth: 180 }}>
                          <Text numberOfLines={1} style={{ color: "#3f51b5", fontWeight: "700" }}>Drops in {countdown}</Text>
                        </View>
                      )}
                      {!daily.posted && (
                        <TouchableOpacity onPress={() => router.push({ pathname: "/(tabs)/search", params: { focusDaily: "1", openComposer: "1" } })} style={{ backgroundColor: '#0095f6', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}>
                          <Text style={{ color: '#fff', fontWeight: '800' }}>Post Daily</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  <Text numberOfLines={2} ellipsizeMode='tail' style={{ marginTop: 6, color: "#333", paddingHorizontal: 16 }}>{daily.prompt?.text}</Text>
                  {!!daily?.posted && (
                    <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
                      <Text style={{ color: '#666', marginBottom: 6, fontWeight: '600' }}>Your Daily</Text>
                      <View style={{ height: 70 }}>
                        <View style={{ width: 70, alignItems: 'center', marginRight: 8 }}>
                          {myDaily?.mediaUrl ? (
                            <Image source={{ uri: myDaily.mediaUrl }} style={{ width: 66, height: 66, borderRadius: 8, backgroundColor: '#eee' }} />
                          ) : (
                            <View style={{ width: 66, height: 66, borderRadius: 8, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 }}>
                              <Text numberOfLines={3} style={{ color: '#444', fontSize: 10, textAlign: 'center' }}>{myDaily?.text || 'Posted'}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  )}
                  {daily?.posted && (
                    <View style={{ height: 120, marginTop: 8 }}>
                      <FlatList
                        data={daily?.rings || []}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyExtractor={(_, idx) => String(idx)}
                        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 10 }}
                        renderItem={({ item }) => (
                          <DailyRing
                            imageUrl={item?.user?.profilePic || "https://i.pravatar.cc/100?img=11"}
                            label={item?.user?.name || "Friend"}
                            onPress={() => router.push({ pathname: "/daily/viewer", params: { userId: item?.user?._id } })}
                          />
                        )}
                      />
                    </View>
                  )}
                </TouchableOpacity>
              )}
              {/* Removed static stories strip */}
            </View>
          </>
        }
        data={[
          {
            id: "1",
            user: "John",
            location: "New York",
            userImage:
              "https://res.cloudinary.com/dlehbizfp/image/upload/f_jpg/v1755065855/circle_uploads/jqn1ydnekml88cf4k2f0.jpg",
            postImage:
              "https://res.cloudinary.com/dlehbizfp/image/upload/f_jpg/v1755065855/circle_uploads/jqn1ydnekml88cf4k2f0.jpg",
            likes: 120,
            caption: "Enjoying the sunshine 🌟",
          },
          {
            id: "2",
            user: "Emma",
            location: "Paris",
            userImage: "https://i.pravatar.cc/150?img=3",
            postImage:
              "https://res.cloudinary.com/dlehbizfp/image/upload/f_jpg/v1755065855/circle_uploads/jqn1ydnekml88cf4k2f0.jpg",
            likes: 200,
            caption: "Cafe mornings ☕",
          },
        ]}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.postContainer}>
            <View style={styles.postHeader}>
              <Image source={{ uri: item.userImage }} style={styles.userImage} />
              <View style={styles.userInfo}>
                <Text style={styles.username}>{item.user}</Text>
                <Text style={styles.location}>{item.location}</Text>
              </View>
              <TouchableOpacity style={styles.menuButton}>
                <Ionicons name="ellipsis-horizontal" size={20} color="#262626" />
              </TouchableOpacity>
            </View>
            <View style={styles.postImageWrapper}>
              <Image source={{ uri: item.postImage }} style={styles.postImage} />
            </View>
            <View style={styles.actions}>
              <View style={styles.leftActions}>
                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="heart-outline" size={28} color="#262626" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} onPress={() => openComments(item)}>
                  <Ionicons name="chatbubble-outline" size={28} color="#262626" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="paper-plane-outline" size={28} color="#262626" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.actionButton}>
                <Ionicons name="bookmark-outline" size={28} color="#262626" />
              </TouchableOpacity>
            </View>
            <Text style={styles.likes}>{item.likes} likes</Text>
            <View style={styles.captionContainer}>
              <Text style={styles.caption}>
                <Text style={styles.captionUsername}>{item.user} </Text>
                {item.caption}
              </Text>
            </View>
            <TouchableOpacity onPress={() => openComments(item)}>
              <Text style={styles.viewComments}>View all comments</Text>
            </TouchableOpacity>
            <Text style={styles.timeAgo}>2 hours ago</Text>
          </View>
        )}
        showsVerticalScrollIndicator={false}
      />

      {/* Modal */}
      <Modal visible={modalVisible} animationType="slide" onRequestClose={closeComments}>
        {selectedPost && <CommentModal postImage={selectedPost.postImage} postUser={selectedPost.user} />}
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "white",
    borderBottomWidth: 0.5,
    borderBottomColor: "#dbdbdb",
    paddingTop:40
  },
  appTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#262626",
    fontFamily: "System",
  },
  notificationButton: {
    padding: 8,
    position: "relative",
  },
  notificationBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: "#FF3040",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
  },
  badgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center",
  },
  storiesContainer: {
    paddingVertical: 16,
    paddingLeft: 16,
    backgroundColor: "white",
    borderBottomWidth: 0.5,
    borderBottomColor: "#dbdbdb",
  },
  storyItem: {
    alignItems: "center",
    marginRight: 16,
    width: 70,
  },
  storyRing: {
    height: 70,
    width: 70,
    borderRadius: 35,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  storyImage: {
    height: 64,
    width: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: "white",
  },
  storyName: {
    fontSize: 12,
    marginTop: 6,
    textAlign: "center",
    color: "#262626",
    fontWeight: "400",
  },
  postContainer: {
    backgroundColor: "white",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    paddingBottom: 8,
  },
  userImage: {
    height: 42,
    width: 42,
    borderRadius: 21,
    marginRight: 12,
    borderWidth: 0.5,
    borderColor: "#dbdbdb",
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontWeight: "600",
    fontSize: 14,
    color: "#262626",
  },
  location: {
    fontSize: 12,
    color: "#8e8e8e",
    marginTop: 1,
  },
  menuButton: {
    padding: 8,
  },
  postImage: {
    width: width - 2,
    height: width,
    borderRadius: 12,
  },
  postImageWrapper: {
    paddingHorizontal: 1,
    paddingTop: 1,
    backgroundColor: '#fff',
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  leftActions: {
    flexDirection: "row",
    gap: 16,
  },
  actionButton: {
    padding: 4,
  },
  likes: {
    fontWeight: "600",
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#262626",
  },
  captionContainer: {
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  caption: {
    fontSize: 14,
    lineHeight: 18,
    color: "#262626",
  },
  captionUsername: {
    fontWeight: "600",
    color: "#262626",
  },
  viewComments: {
    paddingHorizontal: 12,
    paddingTop: 4,
    fontSize: 14,
    color: "#8e8e8e",
  },
  timeAgo: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 12,
    fontSize: 12,
    color: "#8e8e8e",
    textTransform: "uppercase",
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    height: 40,
    width: 120,
  },
})