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
const { width } = Dimensions.get("window")

export default function HomeScreen() {
  const [selectedPost, setSelectedPost] = useState(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [socket, setSocket] = useState(null)
  const [daily, setDaily] = useState<{ prompt?: any; posted?: boolean; streak?: any } | null>(null)
  const router = useRouter()

  const BASE_URL = "http://192.168.98.127:5000"

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
    fetchUnreadCount()
    initializeSocket()
    loadDaily()

    return () => {}
  }, [])

  const loadDaily = async () => {
    try {
      const [p, s] = await Promise.all([api.getDailyPrompt(), api.getDailyStreak()])
      setDaily({ prompt: (p as any)?.prompt, posted: (p as any)?.posted, streak: (s as any)?.streak })
    } catch {}
  }

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
                  }}
                  onPress={() => router.push({ pathname: "/(tabs)/search", params: { focusDaily: "1" } })}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8 }}>
                    <Text style={{ fontWeight: "800", fontSize: 18 }}>Daily Circle</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ backgroundColor: daily.posted ? "#e8f5e9" : "#fdecea", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 }}>
                        <Text style={{ color: daily.posted ? "#2e7d32" : "#c62828", fontWeight: "700" }}>
                          {daily.posted ? `Streak ${daily.streak?.current || 0}` : "Post to unlock"}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Text style={{ marginTop: 6, color: "#333", paddingHorizontal: 16 }}>{daily.prompt?.text}</Text>
                  <View style={{ height: 120, marginTop: 8 }}>
                    <FlatList
                      data={[1,2,3,4,5,6]}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyExtractor={(i) => String(i)}
                      contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 10 }}
                      renderItem={({ item }) => (
                        <View style={{ width: 70, alignItems: "center", marginHorizontal: 6 }}>
                          <View style={{ width: 66, height: 66, borderRadius: 33, backgroundColor: "#f0f0f0", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#e6e6e6" }}>
                            {/* Placeholder ring; can show friends avatars who posted */}
                          </View>
                          <Text style={{ fontSize: 12, color: "#666", marginTop: 6 }}>Friend</Text>
                        </View>
                      )}
                    />
                  </View>
                </TouchableOpacity>
              )}
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={[
                  {
                    id: "1",
                    name: "Your Story",
                    image:
                      "https://res.cloudinary.com/dlehbizfp/image/upload/f_jpg/v1755065855/circle_uploads/jqn1ydnekml88cf4k2f0.jpg",
                  },
                  {
                    id: "2",
                    name: "John",
                    image:
                      "https://res.cloudinary.com/dlehbizfp/image/upload/f_jpg/v1755065855/circle_uploads/jqn1ydnekml88cf4k2f0.jpg",
                  },
                  {
                    id: "3",
                    name: "Emma",
                    image:
                      "https://res.cloudinary.com/dlehbizfp/image/upload/f_jpg/v1755065855/circle_uploads/jqn1ydnekml88cf4k2f0.jpg",
                  },
                  {
                    id: "4",
                    name: "Mike",
                    image:
                      "https://res.cloudinary.com/dlehbizfp/image/upload/f_jpg/v1755065855/circle_uploads/jqn1ydnekml88cf4k2f0.jpg",
                  },
                ]}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={styles.storyItem}>
                    <LinearGradient colors={["#DE0046", "#F7A34B"]} style={styles.storyRing}>
                      <Image source={{ uri: item.image }} style={styles.storyImage} />
                    </LinearGradient>
                    <Text style={styles.storyName}>{item.name}</Text>
                  </View>
                )}
              />
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
            <Image source={{ uri: item.postImage }} style={styles.postImage} />
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
    top: 4,
    right: 4,
    backgroundColor: "#FF3040",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
  },
  badgeText: {
    color: "white",
    fontSize: 12,
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
    width: width,
    height: width,
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
