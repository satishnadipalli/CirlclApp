"use client"

// app/(tabs)/profile.jsx
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Image,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native"
import { io } from "socket.io-client"
const { width } = Dimensions.get("window")

const highlights = [
  { id: "1", image: "https://i.pravatar.cc/150?img=31", label: "Travel" },
  { id: "2", image: "https://i.pravatar.cc/150?img=32", label: "Food" },
  { id: "3", image: "https://i.pravatar.cc/150?img=33", label: "Pets" },
  { id: "4", image: "https://i.pravatar.cc/150?img=34", label: "Gym" },
]

export default function ProfileScreen() {
  const [user, setUser] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [posts, setPosts] = useState([])
  const [mentionedPosts, setMentionedPosts] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [hasMorePosts, setHasMorePosts] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isFollowing, setIsFollowing] = useState(false)
  const [socket, setSocket] = useState(null)
  const [activeTab, setActiveTab] = useState("posts")
  const router = useRouter()
  const { userId } = useLocalSearchParams()

  const handleFollowToggle = async () => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token) {
        Alert.alert("Error", "Please login to follow this user")
        return
      }

      const response = await fetch(`http://192.168.53.127:5000/api/users/${userId}/follow`, {
        method: isFollowing ? "DELETE" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      })

      if (response.ok) {
        setIsFollowing(!isFollowing)
      } else {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
    } catch (error) {
      console.error("Error toggling follow:", error)
      Alert.alert("Error", "Failed to toggle follow")
    }
  }

  useEffect(() => {
    initializeProfile()

    return () => {
      if (socket) {
        socket.disconnect()
      }
    }
  }, [userId])

  useEffect(() => {
    if (currentUser) {
      setupSocket(currentUser)
    }
  }, [currentUser])

  useEffect(() => {
    console.log("[v0] Mentioned posts state updated:", mentionedPosts?.length || 0)
  }, [mentionedPosts])

  useEffect(() => {
    if (activeTab === "tagged" && mentionedPosts.length === 0 && currentUser) {
      console.log("[v0] Tagged tab selected, fetching mentioned posts...")
      fetchMentionedPosts()
    }
  }, [activeTab, currentUser])

  const initializeProfile = async () => {
    try {
      const currentUserData = await fetchCurrentUser()
      if (userId) {
        await fetchUserProfile(userId, currentUserData)
      } else {
        await fetchUserProfile(null, currentUserData)
      }
      await fetchUserPosts()
    } catch (error) {
      console.error("Error initializing profile:", error)
      Alert.alert("Error", "Failed to load profile data")
    } finally {
      setLoading(false)
    }
  }

  const setupSocket = async (userId) => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token) return

      if (socket) {
        socket.disconnect()
      }

      const socketInstance = io("http://192.168.53.127:5000", {
        auth: { token },
      })

      socketInstance.on("connect", () => {
        socketInstance.emit("register", userId)
      })

      socketInstance.on("newFollower", (data) => {
        if (data.followedId === userId) {
          setUser((prev) =>
            prev
              ? {
                  ...prev,
                  followers: [...(prev.followers || []), data.followerId],
                }
              : null,
          )
        }
      })

      socketInstance.on("unfollowed", (data) => {
        if (data.unfollowedId === userId) {
          setUser((prev) =>
            prev
              ? {
                  ...prev,
                  followers: prev.followers?.filter((id) => id !== data.unfollowerId) || [],
                }
              : null,
          )
        }
      })

      socketInstance.on("connect_error", (error) => {
        console.error("Socket connection error:", error)
      })

      socketInstance.on("disconnect", (reason) => {
        console.log("Socket disconnected:", reason)
      })

      setSocket(socketInstance)
    } catch (error) {
      console.error("Socket setup error:", error)
    }
  }

  const fetchCurrentUser = async () => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token) return null

      const response = await fetch("http://192.168.53.127:5000/api/users/me", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      })

      if (response.ok) {
        const data = await response.json()
        setCurrentUser(data)
        return data
      }
    } catch (error) {
      console.error("Error fetching current user:", error)
    }
    return null
  }

  const fetchUserProfile = async (targetUserId, currentUserData = null) => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token) {
        Alert.alert("Error", "Please login to view profile")
        return
      }

      const endpoint = targetUserId
        ? `http://192.168.53.127:5000/api/users/${targetUserId}`
        : "http://192.168.53.127:5000/api/users/me"

      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      setUser(data.user || data)

      const currentUserToCheck = currentUserData || currentUser
      if (targetUserId && currentUserToCheck) {
        const isCurrentlyFollowing = currentUserToCheck.following?.includes(targetUserId) || false
        setIsFollowing(isCurrentlyFollowing)
        console.log("[v0] Setting follow status:", isCurrentlyFollowing, "for user:", targetUserId)
      }
    } catch (error) {
      console.error("Error fetching user profile:", error)
      throw error
    }
  }

  const fetchUserPosts = async (page = 1, append = false) => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token) {
        console.error("No token found")
        return
      }

      let endpoint
      if (userId && userId !== currentUser?._id) {
        endpoint = `http://192.168.53.127:5000/api/posts?userId=${userId}&page=${page}&limit=10&t=${Date.now()}`
      } else {
        endpoint = `http://192.168.53.127:5000/api/posts/me?page=${page}&limit=10&t=${Date.now()}`
      }

      console.log("[v0] Fetching posts from:", endpoint)

      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      console.log("[v0] API response data:", data)
      console.log("[v0] Posts count:", data.posts?.length || 0)
      console.log("[v0] Mentioned posts count:", data.mentionedPosts?.length || 0)

      const userPosts = data.posts || []

      const formattedPosts = userPosts.map((post) => ({
        _id: post._id,
        image: post.mediaUrl || "https://i.pravatar.cc/500?img=21",
        title: post.title,
        description: post.description,
        likes: post.likes || [],
        comments: post.comments || [],
        createdAt: post.createdAt,
        user: post.user,
      }))

      if (!append) {
        await fetchMentionedPosts()
      }

      if (append) {
        setPosts((prev) => [...prev, ...formattedPosts])
      } else {
        setPosts(formattedPosts)
      }

      setCurrentPage(data.currentPage || 1)
      setTotalPages(data.totalPages || 1)
      setHasMorePosts((data.currentPage || 1) < (data.totalPages || 1))
    } catch (error) {
      console.error("Error fetching posts:", error)
      if (!append) {
        const placeholderPosts = [
          { _id: "1", image: "https://i.pravatar.cc/500?img=21", createdAt: new Date().toISOString() },
          { _id: "2", image: "https://i.pravatar.cc/500?img=22", createdAt: new Date().toISOString() },
          { _id: "3", image: "https://i.pravatar.cc/500?img=23", createdAt: new Date().toISOString() },
        ]
        setPosts(placeholderPosts)
        setMentionedPosts([])
      }
    }
  }

  const fetchMentionedPosts = async () => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token || !currentUser) return

      const endpoint = `http://192.168.53.127:5000/api/posts/me?page=1&limit=100&t=${Date.now()}`

      console.log("[v0] Fetching mentioned posts from:", endpoint)

      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      const mentionedPostsData = data.mentionedPosts || []

      const formattedMentionedPosts = mentionedPostsData.map((post) => ({
        _id: post._id,
        image: post.mediaUrl || "https://i.pravatar.cc/500?img=21",
        title: post.title,
        description: post.description,
        likes: post.likes || [],
        comments: post.comments || [],
        createdAt: post.createdAt,
        user: post.user,
      }))

      console.log("[v0] Setting mentioned posts:", formattedMentionedPosts.length)
      setMentionedPosts(formattedMentionedPosts)
    } catch (error) {
      console.error("Error fetching mentioned posts:", error)
      setMentionedPosts([])
    }
  }

  const loadMorePosts = async () => {
    if (loadingMore || !hasMorePosts) return

    setLoadingMore(true)
    await fetchUserPosts(currentPage + 1, true)
    setLoadingMore(false)
  }

  const onRefresh = async () => {
    setRefreshing(true)
    setIsFollowing(false)
    setCurrentPage(1)
    setHasMorePosts(true)
    setPosts([])
    setMentionedPosts([])
    await initializeProfile()
    setRefreshing(false)
  }

  const handleMessage = () => {
    if (!user || !currentUser) return

    router.push({
      pathname: `/chats/${user._id}`,
      params: {
        userId: user._id,
        name: user.name,
        profilePic: user.profilePic || "https://i.pravatar.cc/150?img=30",
        currentUserId: currentUser._id,
      },
    })
  }

  const handleEditProfile = () => {
    router.push("/notifications")
  }

  const handleShareProfile = () => {
    Alert.alert("Share Profile", `Share ${user?.name}'s profile`)
  }

  const handleCreatePost = () => {
    router.push("/create-post")
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case "posts":
        return renderPostsContent()
      case "reels":
        return renderEmptyTabContent("🎬", "No Reels Yet", "Share your first reel to get started!")
      case "tagged":
        return renderTaggedContent()
      default:
        return renderPostsContent()
    }
  }

  const renderTaggedContent = () => {
    console.log("[v0] Rendering tagged content - Mentioned posts count:", mentionedPosts?.length || 0)
    console.log("[v0] Mentioned posts data:", mentionedPosts)

    if (mentionedPosts && mentionedPosts.length > 0) {
      return (
        <View style={styles.tabContentContainer}>
          <FlatList
            data={mentionedPosts}
            keyExtractor={(item) => `tagged_${item._id}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.postContainer}
                onPress={() => {
                  Alert.alert("Tagged Post", `${item.title || "Post"}\n${item.description || ""}`)
                }}
              >
                <Image source={{ uri: item.image }} style={styles.postImage} />
                <View style={styles.postOverlay}>
                  <View style={styles.postStats}>
                    <Text style={styles.postStatText}>❤️ {item.likes?.length || 0}</Text>
                    <Text style={styles.postStatText}>💬 {item.comments?.length || 0}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
            numColumns={3}
            scrollEnabled={true}
          />
        </View>
      )
    } else {
      return renderEmptyTabContent("🏷️", "No Tagged Posts", "You haven't been tagged in any posts yet.")
    }
  }

  const renderPostsContent = () => {
    if (posts && posts.length > 0) {
      return (
        <View style={styles.tabContentContainer}>
          <FlatList
            data={posts}
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.postContainer}
                onPress={() => {
                  Alert.alert("Post", `${item.title || "Post"}\n${item.description || ""}`)
                }}
              >
                <Image source={{ uri: item.image }} style={styles.postImage} />
                <View style={styles.postOverlay}>
                  <View style={styles.postStats}>
                    <Text style={styles.postStatText}>❤️ {item.likes?.length || 0}</Text>
                    <Text style={styles.postStatText}>💬 {item.comments?.length || 0}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
            numColumns={3}
            scrollEnabled={true}
            onEndReached={loadMorePosts}
            onEndReachedThreshold={0.1}
            ListFooterComponent={() => {
              if (loadingMore && hasMorePosts) {
                return (
                  <View style={styles.loadingMore}>
                    <ActivityIndicator size="small" color="#007bff" />
                    <Text style={styles.loadingMoreText}>Loading more posts...</Text>
                  </View>
                )
              }
              return null
            }}
          />
        </View>
      )
    } else {
      return renderEmptyTabContent(
        "📸",
        isOwnProfile ? "Share Your First Moment" : "No Posts Yet",
        isOwnProfile
          ? "When you share photos and videos, they'll appear on your profile."
          : `${user?.name || "This user"} hasn't shared any posts yet.`,
        isOwnProfile,
      )
    }
  }

  const renderEmptyTabContent = (icon, title, description, showButton = false) => {
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyStateIcon}>
          <Text style={styles.emptyStateIconText}>{icon}</Text>
        </View>
        <Text style={styles.emptyStateTitle}>{title}</Text>
        <Text style={styles.emptyStateDescription}>{description}</Text>
        {showButton && (
          <TouchableOpacity style={styles.newPostButton} onPress={handleCreatePost}>
            <Text style={styles.newPostButtonText}>Share Your First Post</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  const renderProfileHeader = () => (
    <View>
      {/* Top Section */}
      <View style={styles.topSection}>
        <Image source={{ uri: user.profilePic || "https://i.pravatar.cc/150?img=30" }} style={styles.profilePic} />
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statNumber}>{posts?.length || 0}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statNumber}>{user?.followers?.length || 0}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statNumber}>{user?.following?.length || 0}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
        </View>
      </View>

      {/* Bio Section */}
      <View style={styles.bioSection}>
        <Text style={styles.username}>{user?.name}</Text>
        <Text style={styles.bio}>{user?.bio || "📍 Traveler | 📸 Photographer | ☕ Coffee Lover"}</Text>
        {user?.website && <Text style={styles.bioLink}>{user?.website}</Text>}
      </View>

      {/* Buttons */}
      <View style={styles.buttonsRow}>
        {isOwnProfile ? (
          <>
            <TouchableOpacity style={styles.button} onPress={handleEditProfile}>
              <Text style={styles.buttonText}>Edit Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={handleShareProfile}>
              <Text style={styles.buttonText}>Share Profile</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.button, isFollowing ? styles.followingButton : styles.followButton]}
              onPress={handleFollowToggle}
            >
              <Text style={[styles.buttonText, isFollowing ? styles.followingButtonText : styles.followButtonText]}>
                {isFollowing ? "Following" : "Follow"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={handleMessage}>
              <Text style={styles.buttonText}>Message</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Highlights */}
      <FlatList
        data={highlights}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 15, paddingLeft: 10 }}
        renderItem={({ item }) => (
          <View style={styles.highlight}>
            <Image source={{ uri: item.image }} style={styles.highlightImage} />
            <Text style={styles.highlightLabel}>{item.label}</Text>
          </View>
        )}
      />

      {/* Instagram-like tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "posts" && styles.activeTab]}
          onPress={() => setActiveTab("posts")}
        >
          <Text style={[styles.tabIcon, activeTab === "posts" && styles.activeTabIcon]}>⊞</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "reels" && styles.activeTab]}
          onPress={() => setActiveTab("reels")}
        >
          <Text style={[styles.tabIcon, activeTab === "reels" && styles.activeTabIcon]}>▶</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "tagged" && styles.activeTab]}
          onPress={() => {
            console.log("[v0] Switching to tagged tab")
            setActiveTab("tagged")
          }}
        >
          <Text style={[styles.tabIcon, activeTab === "tagged" && styles.activeTabIcon]}>👤</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    )
  }

  if (!user) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Failed to load profile</Text>
        <TouchableOpacity style={styles.retryButton} onPress={initializeProfile}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const isOwnProfile = !userId || (currentUser && user?._id === currentUser?._id)

  return (
    <View style={styles.container}>
      <FlatList
        data={[{ key: "content" }]}
        keyExtractor={(item) => item.key}
        renderItem={() => renderTabContent()}
        ListHeaderComponent={renderProfileHeader}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={activeTab === "posts" ? loadMorePosts : undefined}
        onEndReachedThreshold={0.1}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  errorText: {
    fontSize: 16,
    color: "#ff0000",
    textAlign: "center",
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: "#007bff",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
  },
  retryButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  topSection: {
    flexDirection: "row",
    padding: 15,
    paddingTop: 50,
    alignItems: "center",
  },
  profilePic: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  stats: {
    flexDirection: "row",
    flex: 1,
    justifyContent: "space-around",
  },
  stat: {
    alignItems: "center",
  },
  statNumber: {
    fontSize: 18,
    fontWeight: "bold",
  },
  statLabel: {
    color: "gray",
  },
  bioSection: {
    paddingHorizontal: 15,
  },
  username: {
    fontWeight: "bold",
  },
  bio: {
    marginTop: 2,
  },
  bioLink: {
    color: "#00376b",
    marginTop: 2,
  },
  buttonsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 10,
    marginTop: 10,
  },
  button: {
    flex: 1,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 5,
    paddingVertical: 6,
    alignItems: "center",
  },
  buttonText: {
    fontWeight: "bold",
  },
  highlight: {
    alignItems: "center",
    marginRight: 15,
  },
  highlightImage: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  highlightLabel: {
    marginTop: 4,
    fontSize: 12,
  },
  postImage: {
    width: width / 3,
    height: width / 3,
  },
  followButton: {
    backgroundColor: "#007bff",
  },
  followButtonText: {
    color: "#fff",
  },
  followingButton: {
    backgroundColor: "#f0f0f0",
  },
  followingButtonText: {
    color: "#333",
  },
  postContainer: {
    position: "relative",
  },
  postOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
    opacity: 0,
  },
  postStats: {
    flexDirection: "row",
    gap: 10,
  },
  postStatText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 12,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyStateIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#f8f9fa",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "#e9ecef",
  },
  emptyStateIconText: {
    fontSize: 32,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#212529",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyStateDescription: {
    fontSize: 14,
    color: "#6c757d",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  newPostButton: {
    backgroundColor: "#007bff",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  newPostButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  tabsContainer: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#e1e1e1",
    backgroundColor: "#fff",
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomColor: "#262626",
  },
  tabIcon: {
    fontSize: 24,
    color: "#8e8e8e",
  },
  activeTabIcon: {
    color: "#262626",
  },
  loadingMore: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 20,
    gap: 10,
  },
  loadingMoreText: {
    fontSize: 14,
    color: "#666",
  },
  loadMoreButton: {
    backgroundColor: "#f8f9fa",
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginVertical: 10,
    marginHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  loadMoreButtonText: {
    fontSize: 16,
    color: "#007bff",
    fontWeight: "600",
  },
  tabContentContainer: {
    flex: 1,
  },
})
