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
import socketService from "@/services/socket.service"
import PresenceBadge from "@/components/PresenceBadge"
import Skeleton from "@/components/Skeleton"
import { useTheme } from "@/contexts/ThemeContext"
import { apiService } from "@/services/api.service"
const { width } = Dimensions.get("window")

export default function ProfileScreen() {
  const { colors } = useTheme()
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
  const [hasRequested, setHasRequested] = useState(false)
  const [viewer, setViewer] = useState<any>(null)
  const [streakBadge, setStreakBadge] = useState<{ current: number; longest: number; tier: { name: string; color: string } } | null>(null)
  const [activeTab, setActiveTab] = useState("posts")
  const [myHighlights, setMyHighlights] = useState<any[]>([])
  const router = useRouter()
  const { userId } = useLocalSearchParams()

  const handleFollowToggle = async () => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token) {
        Alert.alert("Error", "Please login to follow this user")
        return
      }

      const api = (await import("@/services/api.service")).apiService
      if (isFollowing) {
        await api.unfollowUser(String(userId))
        setIsFollowing(false)
        setHasRequested(false)
        setViewer((v: any) => v ? { ...v, isFollowing: false, hasRequested: false, canViewPosts: false } : v)
      } else {
        const res: any = await api.followUser(String(userId))
        if (res?.requested) {
          setHasRequested(true)
          setViewer((v: any) => v ? { ...v, hasRequested: true } : v)
        } else {
          setIsFollowing(true)
          setViewer((v: any) => v ? { ...v, isFollowing: true, canViewPosts: true } : v)
        }
      }
    } catch (error) {
      console.error("Error toggling follow:", error)
      Alert.alert("Error", "Failed to toggle follow")
    }
  }

  useEffect(() => {
    initializeProfile()

    return () => {}
  }, [userId])

  useEffect(() => {
    if (currentUser) {
      setupSocket(currentUser)
    }
  }, [currentUser])

  useEffect(() => {
    if (activeTab === "tagged" && mentionedPosts.length === 0 && currentUser) {
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
      // Load highlights for own profile
      try {
        if (!userId || (currentUserData && String(currentUserData?._id) === String(userId))) {
          const r: any = await apiService.getDailyHighlights()
          const list = Array.isArray(r?.entries) ? r.entries : []
          setMyHighlights(list)
        } else setMyHighlights([])
      } catch { setMyHighlights([]) }
    } catch (error) {
      console.error("Error initializing profile:", error)
      Alert.alert("Error", "Failed to load profile data")
    } finally {
      setLoading(false)
    }
  }

  const setupSocket = async (userId) => {
    try {
      // No connect here; rely on global
      socketService.registerUser(userId)

      const onFollow = (evt: any) => {
        if (evt.type !== "follow") return
        const data = evt.data
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
      }
      const onUnfollow = (evt: any) => {
        if (evt.type !== "unfollow") return
        const data = evt.data
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
      }
      socketService.onFollowEvent(onFollow)
      socketService.onFollowEvent(onUnfollow)

      return () => {
        socketService.removeFollowEventListener(onFollow)
        socketService.removeFollowEventListener(onUnfollow)
      }
    } catch {}
  }

  const fetchCurrentUser = async () => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token) return null

      const api = (await import("@/services/api.service")).apiService
      const me = await api.getMe()
      const data: any = me
      if (data) { setCurrentUser(data.user || data); return (data.user || data) }
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

      const api = (await import("@/services/api.service")).apiService
      const data = targetUserId ? await api.getUserProfile(String(targetUserId)) : await api.getMe()
      const payload: any = data
      setUser(payload.user || payload)
      // Load target user's streak for badge
      try {
        const target = String(targetUserId || (payload?.user?._id || payload?._id || ''))
        if (target) {
          const s: any = await apiService.getUserStreak(target)
          if (s?.success && s?.streak) setStreakBadge({ current: Number(s.streak.current||0), longest: Number(s.streak.longest||0), tier: { name: String(s.streak.tier?.name || 'New'), color: String(s.streak.tier?.color || '#ddd') } })
          else setStreakBadge(null)
        }
      } catch { setStreakBadge(null) }
      if (payload.viewer) {
        setViewer(payload.viewer)
        setIsFollowing(!!payload.viewer.isFollowing)
        setHasRequested(!!payload.viewer.hasRequested)
      }

      const currentUserToCheck = currentUserData || currentUser
      if (targetUserId && currentUserToCheck) {
        const isCurrentlyFollowing = currentUserToCheck.following?.includes(targetUserId) || false
        setIsFollowing(isCurrentlyFollowing)
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

      const api = (await import("@/services/api.service")).apiService
      const data: any = (userId && userId !== (currentUser?._id))
        ? await (api as any).getUserPosts?.(String(userId), page, 10)
        : await (api as any).getMyPosts?.(page, 10)

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

      const api = (await import("@/services/api.service")).apiService
      const data: any = await api.getMyPosts ? await (api as any).getMyPosts?.(1, 100) : await api.request(`/posts/me?page=1&limit=100`)
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
        chatType:"direct",
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
    const canView = viewer?.canViewPosts !== false
    if (!canView && !isOwnProfile) {
      return (
        <View style={styles.tabContentContainer}>
          <View style={styles.emptyState}>
            <View style={styles.emptyStateIcon}><Text style={styles.emptyStateIconText}>🔒</Text></View>
            <Text style={styles.emptyStateTitle}>This account is private</Text>
            <Text style={styles.emptyStateDescription}>Follow to see their photos and videos.</Text>
          </View>
        </View>
      )
    }
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

  const [presenceOnline, setPresenceOnline] = useState<boolean>(false)
  const [presenceLastSeen, setPresenceLastSeen] = useState<string | undefined>(undefined)

  useEffect(() => {
    (async () => {
      try {
        if (!userId) return
        const r: any = await (await import('@/services/api.service')).apiService.getLastSeen(String(userId))
        if (r?.success) setPresenceLastSeen(r?.lastActiveAt || undefined)
        const seed: any = await (await import('@/services/api.service')).apiService.getOnlineUsers()
        const online = new Set<string>((seed?.userIds || []).map(String))
        setPresenceOnline(online.has(String(userId)))
      } catch {}
    })()
    const onStatus = (data: { userId: string; status: 'online'|'offline' }) => {
      if (String(data.userId) !== String(userId)) return
      setPresenceOnline(data.status === 'online')
      if (data.status === 'offline') {
        ;(async () => { try { const r: any = await (await import('@/services/api.service')).apiService.getLastSeen(String(userId)); if (r?.success) setPresenceLastSeen(r?.lastActiveAt || undefined) } catch {} })()
      }
    }
    socketService.onUserStatusChange(onStatus)
    return () => { socketService.removeUserStatusListener(onStatus) }
  }, [userId])

  const renderProfileHeader = () => (
    <View style={{ backgroundColor: colors.background }}>
      {/* Top Section */}
      <View style={[styles.topSection, { borderBottomColor: colors.border }]}>
        <View>
          {(() => {
            const ringColor = streakBadge?.tier?.color || colors.border
            return (
              <View style={{ borderWidth: 3, borderColor: ringColor, borderRadius: 52, padding: 3 }}>
                <Image source={{ uri: user.profilePic || "https://i.pravatar.cc/150?img=30" }} style={[styles.profilePic]} />
              </View>
            )
          })()}
        </View>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={[styles.statNumber, { color: colors.text }]}>{posts?.length || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Posts</Text>
          </View>
          <TouchableOpacity style={styles.stat} onPress={() => { if (viewer && viewer.canViewPosts === false && !isOwnProfile) return; router.push(`/followers/${(user as any)?._id || (userId as any)}`) }}>
            <Text style={[styles.statNumber, { color: colors.text }]}>{(user as any)?.followers?.length || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Followers</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stat} onPress={() => { if (viewer && viewer.canViewPosts === false && !isOwnProfile) return; router.push(`/following/${(user as any)?._id || (userId as any)}`) }}>
            <Text style={[styles.statNumber, { color: colors.text }]}>{(user as any)?.following?.length || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Following</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bio Section */}
      <View style={[styles.bioSection, { borderBottomColor: colors.border }]}>
        <Text style={[styles.username, { color: colors.text }]}>{user?.name}</Text>
        <Text style={[styles.bio, { color: colors.text }]}>{user?.bio || "📍 Traveler | 📸 Photographer | ☕ Coffee Lover"}</Text>
        {user?.website && <Text style={[styles.bioLink, { color: colors.primary }]}>{user?.website}</Text>}
        {streakBadge && (
          <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ backgroundColor: streakBadge.tier.color, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: '#000', fontWeight: '900', fontSize: 12 }}>{streakBadge.tier.name}</Text>
            </View>
            <Text style={{ color: colors.muted, fontWeight: '700' }}>Streak {streakBadge.current}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Longest {streakBadge.longest}</Text>
          </View>
        )}
        <View style={{ marginTop: 6 }}>
          <PresenceBadge isOnline={false} lastSeen={undefined} size="sm" />
        </View>
      </View>

      {/* Own profile: streak card + highlights */}
      {!userId || (currentUser && String((user as any)?._id) === String(currentUser?._id)) ? (
        <FlatList
          data={myHighlights}
          keyExtractor={(e) => String(e._id)}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 12, paddingLeft: 12, gap: 14 }}
          ListEmptyComponent={() => (
            <View style={{ paddingHorizontal: 16 }}>
              <Text style={{ color: colors.muted }}>No highlights yet. Long-press your Daily to add one.</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => router.push({ pathname: '/daily/viewer', params: { userId: String(item?.user?._id || '') } })}>
              <View style={{ alignItems: 'center' }}>
                <View style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: '#f59e0b', padding: 3 }}>
                  <Image source={{ uri: item.mediaUrl || 'https://i.pravatar.cc/100?img=17' }} style={{ width: '100%', height: '100%', borderRadius: 36, backgroundColor: '#eee' }} />
                </View>
                <Text numberOfLines={1} style={{ marginTop: 6, maxWidth: 80, textAlign: 'center', color: colors.text, fontWeight: '700', fontSize: 12 }}>{(item.text && item.text.slice(0, 12)) || 'Highlight'}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListHeaderComponent={() => (
            <StreakCard />
          )}
        />
      ) : null}

      {/* Buttons */}
      <View style={styles.buttonsRow}>
        {(!userId || (currentUser && String((user as any)?._id) === String(currentUser?._id))) ? (
          <>
            <TouchableOpacity style={[styles.button, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push('/settings/notifications')}>
              <Text style={[styles.buttonText, { color: colors.text }]}>Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push('/highlights')}>
              <Text style={[styles.buttonText, { color: colors.text }]}>Highlights</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.button, (isFollowing || hasRequested) ? { backgroundColor: colors.surface } : { backgroundColor: colors.primary }, { borderColor: colors.border }]}
              onPress={handleFollowToggle}
            >
              <Text style={[styles.buttonText, { color: (isFollowing || hasRequested) ? colors.text : '#fff' }]}> 
                {isFollowing ? "Following" : hasRequested ? "Requested" : "Follow"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push({ pathname: '/chats/[chatId]', params: { chatId: String((user as any)?._id || '') } })}>
              <Text style={[styles.buttonText, { color: colors.text }]}>Message</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Instagram-like tabs */}
      <View style={[styles.tabsContainer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "posts" && { borderBottomColor: colors.text } ]}
          onPress={() => setActiveTab("posts")}
        >
          <Text style={[styles.tabIcon, { color: colors.muted }, activeTab === "posts" && { color: colors.text }]}>⊞</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "reels" && { borderBottomColor: colors.text }]}
          onPress={() => setActiveTab("reels")}
        >
          <Text style={[styles.tabIcon, { color: colors.muted }, activeTab === "reels" && { color: colors.text }]}>▶</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "tagged" && { borderBottomColor: colors.text }]}
          onPress={() => setActiveTab("tagged")}
        >
          <Text style={[styles.tabIcon, { color: colors.muted }, activeTab === "tagged" && { color: colors.text }]}>👤</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  const StreakCard = () => {
    const [meStreak, setMeStreak] = useState<{ current: number; longest: number; nextMilestone?: number; hitMilestone?: boolean } | null>(null)
    useEffect(() => {
      (async () => {
        try { const r: any = await apiService.getDailyStreak(); if (r?.success && r?.streak) setMeStreak(r.streak) } catch {}
      })()
    }, [])
    if (!meStreak) return null
    const current = Number(meStreak.current || 0)
    const next = Number(meStreak.nextMilestone || 0)
    const pct = next > 0 ? Math.max(0, Math.min(1, current / next)) : 1
    const tier = current >= 60 ? { name: 'Diamond', color: '#7dd3fc' } : current >= 30 ? { name: 'Platinum', color: '#e5e4e2' } : current >= 14 ? { name: 'Gold', color: '#ffd700' } : current >= 7 ? { name: 'Silver', color: '#c0c0c0' } : current >= 1 ? { name: 'Bronze', color: '#cd7f32' } : { name: 'New', color: '#ddd' }
    return (
      <View style={{ marginRight: 14 }}>
        <View style={{ width: 220, backgroundColor: '#f8f9ff', borderColor: '#e6e8ff', borderWidth: 1, borderRadius: 14, padding: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: '#111', fontWeight: '900' }}>Daily Streak</Text>
            <View style={{ backgroundColor: tier.color, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ color: '#000', fontWeight: '900', fontSize: 11 }}>{tier.name}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 8, gap: 8 }}>
            <Text style={{ fontSize: 28, fontWeight: '900', color: '#111' }}>{current}</Text>
            <Text style={{ color: '#666', fontWeight: '700' }}>days</Text>
          </View>
          {!!next && (
            <View style={{ marginTop: 8 }}>
              <View style={{ height: 8, backgroundColor: '#eef0ff', borderRadius: 6, overflow: 'hidden' }}>
                <View style={{ width: `${pct * 100}%`, height: 8, backgroundColor: '#6366f1' }} />
              </View>
              <Text style={{ color: '#666', fontSize: 12, marginTop: 6 }}>Next milestone: {next}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <Text style={{ color: '#666', fontSize: 12 }}>Longest {meStreak.longest || 0}</Text>
            <TouchableOpacity onPress={() => router.push({ pathname: '/search', params: { focusDaily: '1' } })}>
              <Text style={{ color: '#007aff', fontWeight: '800', fontSize: 12 }}>Post now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <View style={{ width: '100%', paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 50 }}>
            <Skeleton width={90} height={90} radius={45} />
            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-around' }}>
              <View style={{ alignItems: 'center' }}>
                <Skeleton width={40} height={18} />
                <Skeleton width={50} height={12} style={{ marginTop: 6 }} />
              </View>
              <View style={{ alignItems: 'center' }}>
                <Skeleton width={40} height={18} />
                <Skeleton width={70} height={12} style={{ marginTop: 6 }} />
              </View>
              <View style={{ alignItems: 'center' }}>
                <Skeleton width={40} height={18} />
                <Skeleton width={70} height={12} style={{ marginTop: 6 }} />
              </View>
            </View>
          </View>
          <View style={{ marginTop: 16 }}>
            <Skeleton width={'40%'} height={16} />
            <Skeleton width={'80%'} height={12} style={{ marginTop: 8 }} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            <Skeleton width={160} height={36} radius={8} />
            <Skeleton width={160} height={36} radius={8} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 24 }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} width={width/3} height={width/3} style={{ marginBottom: 1 }} />
            ))}
          </View>
        </View>
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
