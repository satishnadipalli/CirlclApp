"use client"

// app/(tabs)/profile.tsx
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useRouter } from "expo-router"
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
import socketService from "@/services/socket.service"
const { width } = Dimensions.get("window")

interface User {
  _id: string
  name: string
  email: string
  profilePic: string
  followers: string[]
  following: string[]
  savedPosts: string[]
  bio?: string
  website?: string
}

interface Post {
  _id: string
  image: string
  title?: string
  description?: string
  likes: string[]
  comments: string[]
  createdAt: string
  author: { name: string }
}

const highlights = [
  { id: "1", image: "https://i.pravatar.cc/150?img=31", label: "Travel" },
  { id: "2", image: "https://i.pravatar.cc/150?img=32", label: "Food" },
  { id: "3", image: "https://i.pravatar.cc/150?img=33", label: "Pets" },
  { id: "4", image: "https://i.pravatar.cc/150?img=34", label: "Gym" },
]

export default function ProfileScreen() {
  const [user, setUser] = useState<User | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [mentionedPosts, setMentionedPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [socket, setSocket] = useState<any>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [hasMorePosts, setHasMorePosts] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [activeTab, setActiveTab] = useState("posts")
  const [saved, setSaved] = useState<any[]>([])
  const router = useRouter()

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchUserProfile()
    await fetchUserPosts()
    setRefreshing(false)
  }

  useEffect(() => {
    initializeProfile()

    return () => {}
  }, [])

  useEffect(() => {
    if (user?._id) {
      setupSocket(user._id)
    }
  }, [user])

  const initializeProfile = async () => {
    try {
      await loadUserFromStorage()
      await fetchUserProfile()
      await fetchUserPosts()
    } catch (error) {
      console.error("Error initializing profile:", error)
      Alert.alert("Error", "Failed to load profile data")
    } finally {
      setLoading(false)
    }
  }

  const loadUserFromStorage = async () => {
    try {
      const userData = await AsyncStorage.getItem("user")
      if (userData) {
        const parsedUser = JSON.parse(userData)
        const formattedUser: User = {
          _id: parsedUser.id,
          name: parsedUser.name,
          email: parsedUser.email,
          profilePic: parsedUser.profilePic || "",
          followers: parsedUser.followers || [],
          following: parsedUser.following || [],
          savedPosts: parsedUser.savedPosts || [],
          bio: parsedUser.bio,
          website: parsedUser.website,
        }
        setUser(formattedUser)
      } else {
        throw new Error("No user data found in storage")
      }
    } catch (error) {
      console.error("Error loading user from storage:", error)
      Alert.alert("Error", "Please login again")
      throw error
    }
  }

  const fetchUserProfile = async () => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token) {
        console.error("No token found")
        return
      }

      console.log("[v0] Fetching user profile from API")
      const me = await (await import("@/services/api.service")).apiService.getMe()
      const meObj: any = me

      const src = (meObj && (meObj.user || meObj)) || {}

      const formattedUser: User = {
        _id: src._id,
        name: src.name,
        email: src.email,
        profilePic: src.profilePic || "",
        followers: src.followers || [],
        following: src.following || [],
        savedPosts: src.savedPosts || [],
        bio: src.bio,
        website: src.website,
      }

      setUser(formattedUser)
      console.log("[v0] Updated user with fresh follower/following data")
    } catch (error) {
      console.error("Error fetching user profile:", error)
    }
  }

  const setupSocket = async (userId: string) => {
    try {
      await socketService.connect()
      socketService.onFollowEvent((evt: any) => {
        if (evt.type !== "follow") return
        const data = evt.data
        console.log("[v0] New follower received:", data)
        if (data.followedId === userId) {
          setUser((prev) =>
            prev
              ? {
                  ...prev,
                  followers: [...prev.followers, data.followerId],
                }
              : null,
          )
          console.log("[v0] Updated followers count after new follower")
        }
      })
      socketService.onFollowEvent((evt: any) => {
        if (evt.type !== "unfollow") return
        const data = evt.data
        console.log("[v0] Unfollowed received:", data)
        if (data.unfollowedId === userId) {
          setUser((prev) =>
            prev
              ? {
                  ...prev,
                  followers: prev.followers.filter((id) => id !== data.unfollowerId),
                }
              : null,
          )
          console.log("[v0] Updated followers count after unfollowed")
        }
      })
    } catch (error) {
      console.error("Socket setup error:", error)
    }
  }

  const fetchUserPosts = async (page = 1, append = false) => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token) {
        console.error("No token found")
        return
      }

      const endpoint = require("../../constants/Config").API_BASE_URL + `/posts/me?page=${page}&limit=10&t=${Date.now()}`

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
      const userPosts = data.posts || []
      const mentionedPostsData = data.mentionedPosts || []

      console.log("[v0] API response data:", data)
      console.log("[v0] Posts count:", userPosts.length)
      console.log("[v0] Mentioned posts count:", mentionedPostsData.length)

      const formattedPosts = userPosts.map((post) => ({
        _id: post._id,
        image: post.mediaUrl || "https://i.pravatar.cc/500?img=21",
        title: post.title,
        description: post.description,
        likes: post.likes || [],
        comments: post.comments || [],
        createdAt: post.createdAt,
        author: post.author || post.user,
      }))

      const formattedMentionedPosts = mentionedPostsData.map((post) => ({
        _id: post._id,
        image: post.mediaUrl || "https://i.pravatar.cc/500?img=21",
        title: post.title,
        description: post.description,
        likes: post.likes || [],
        comments: post.comments || [],
        createdAt: post.createdAt,
        author: post.author || post.user,
      }))

      if (append) {
        setPosts((prev) => [...prev, ...formattedPosts])
      } else {
        setPosts(formattedPosts)
        setMentionedPosts(formattedMentionedPosts)
      }

      setCurrentPage(data.currentPage || page)
      setTotalPages(data.totalPages || 1)
      setHasMorePosts(page < (data.totalPages || 1))
    } catch (error) {
      console.error("Error fetching posts:", error)
      if (!append) {
        setPosts([])
        setMentionedPosts([])
      }
    }
  }

  const loadMorePosts = async () => {
    if (loadingMore || !hasMorePosts) return

    setLoadingMore(true)
    await fetchUserPosts(currentPage + 1, true)
    setLoadingMore(false)
  }

  const handleEditProfile = () => {
    router.push("/edit-profile")
  }

  const handleShareProfile = () => {
    Alert.alert("Share Profile", `Share ${user?.name}'s profile`)
  }

  const handleCreatePost = () => {
    router.push("/create/compose-post")
  }

  const handleFollowersPress = () => {
    router.push(`/followers/${user?._id}`)
  }

  const handleFollowingPress = () => {
    router.push(`/following/${user?._id}`)
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case "posts":
        return renderPostsContent()
      case "reels":
        return renderEmptyTabContent("🎬", "No Reels Yet", "Share your first reel to get started!")
      case "tagged":
        return renderTaggedContent()
      case "saved":
        return renderSavedContent()
      default:
        return renderPostsContent()
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
            removeClippedSubviews
            getItemLayout={(_, index) => ({ length: Math.floor(width / 3), offset: Math.floor(width / 3) * index, index })}
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
        "Share Your First Moment",
        "When you share photos and videos, they'll appear on your profile.",
        true,
      )
    }
  }

  const renderTaggedContent = () => {
    console.log("[v0] Rendering tagged content - Mentioned posts count:", mentionedPosts?.length || 0)

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

  const renderSavedContent = () => {
    if (saved && saved.length > 0) {
      return (
        <View style={styles.tabContentContainer}>
          <FlatList
            data={saved}
            keyExtractor={(item) => `saved_${item._id}`}
            renderItem={({ item }) => (
              <View style={styles.postContainer}>
                <Image source={{ uri: item.mediaUrl || item.image }} style={styles.postImage} />
              </View>
            )}
            numColumns={3}
          />
        </View>
      )
    }
    return renderEmptyTabContent("🔖", "No Saved Posts", "Save posts to see them here.")
  }

  const renderEmptyTabContent = (icon: string, title: string, description: string, showButton = false) => {
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

  return (
    <View style={styles.container}>
      <FlatList
        data={[{ key: "content" }]}
        keyExtractor={(item) => item.key}
        renderItem={() => renderTabContent()}
        ListHeaderComponent={() => (
          <View>
            <View style={styles.topSection}>
              <Image
                source={{ uri: user.profilePic || "https://i.pravatar.cc/150?img=30" }}
                style={styles.profilePic}
              />
              <View style={styles.stats}>
                <View style={styles.stat}>
                  <Text style={styles.statNumber}>{posts.length}</Text>
                  <Text style={styles.statLabel}>Posts</Text>
                </View>
                <TouchableOpacity style={styles.stat} onPress={handleFollowersPress}>
                  <Text style={styles.statNumber}>{user.followers.length}</Text>
                  <Text style={styles.statLabel}>Followers</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.stat} onPress={handleFollowingPress}>
                  <Text style={styles.statNumber}>{user.following.length}</Text>
                  <Text style={styles.statLabel}>Following</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.bioSection}>
              <Text style={styles.username}>{user.name}</Text>
              <Text style={styles.bio}>{user.bio || "📍 Traveler | 📸 Photographer | ☕ Coffee Lover"}</Text>
              {user.website && <Text style={styles.bioLink}>{user.website}</Text>}
            </View>

            <View style={styles.buttonsRow}>
              <TouchableOpacity style={styles.button} onPress={handleEditProfile}>
                <Text style={styles.buttonText}>Edit Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.button} onPress={handleShareProfile}>
                <Text style={styles.buttonText}>Share Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.button} onPress={async () => { try { await AsyncStorage.multiRemove(["token","user"]); router.push("/login"); } catch {} }}>
                <Text style={styles.buttonText}>Logout</Text>
              </TouchableOpacity>
            </View>

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
              <TouchableOpacity
                style={[styles.tab, activeTab === "saved" && styles.activeTab]}
                onPress={async () => {
                  setActiveTab("saved")
                  try { const r: any = await (await import("@/services/api.service")).apiService.getSavedPosts(); setSaved(r?.savedPosts || r?.posts || []) } catch {}
                }}
              >
                <Text style={[styles.tabIcon, activeTab === "saved" && styles.activeTabIcon]}>★</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
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
  followButton: {
    backgroundColor: "#0095f6",
    borderColor: "#0095f6",
  },
  followButtonText: {
    color: "#fff",
  },
  followingButton: {
    backgroundColor: "#fff",
    borderColor: "#dbdbdb",
  },
  followingButtonText: {
    color: "#262626",
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
  tabContentContainer: {
    flex: 1,
  },
})
