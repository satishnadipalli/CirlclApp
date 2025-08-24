"use client"

import api from "@/services/api.service"
import socketService from "@/services/socket.service"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { Ionicons } from "@expo/vector-icons"
import * as Notifications from "expo-notifications"
import { useRouter } from "expo-router"
import React, { useEffect, useState } from "react"
import { Dimensions, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import DailyRing from "@/components/DailyRing"
import logo from "../../assets/images/circle-full.png"
import * as Haptics from "expo-haptics"
import { Video } from "expo-av"

const { width } = Dimensions.get("window")

export default function HomeScreen() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [daily, setDaily] = useState<{ prompt?: any; posted?: boolean; streak?: any; rings?: any[] } | null>(null)
  const [countdown, setCountdown] = useState<string>("")
  const [myDaily, setMyDaily] = useState<any>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [showCelebration, setShowCelebration] = useState(false)

  const [feed, setFeed] = useState<any[]>([])
  const [feedPage, setFeedPage] = useState(1)
  const [feedHasMore, setFeedHasMore] = useState(true)
  const [feedLoadingMore, setFeedLoadingMore] = useState(false)
  const [feedRefreshing, setFeedRefreshing] = useState(false)
  const likeLocalRef = React.useRef<Record<string, boolean>>({})
  const likeCountLocalRef = React.useRef<Record<string, number>>({})

  const router = useRouter()

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
    loadFeed(1, true)

    const onPosted = () => {
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

  const fetchUnreadCount = async () => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token) return
      const data: any = await api.getUnreadNotificationsCount()
      if (data?.success) setUnreadCount(data.count)
    } catch {}
  }

  const initializeSocket = async () => {
    try {
      await socketService.connect()
      socketService.onNotification(() => setUnreadCount((prev) => prev + 1))
    } catch {}
  }

  const loadDaily = async () => {
    try {
      const [p, s, r] = await Promise.all([api.getDailyPrompt(), api.getDailyStreak(), api.getDailyRings()])
      setDaily({ prompt: (p as any)?.prompt, posted: (p as any)?.posted, streak: (s as any)?.streak, rings: (r as any)?.rings || [] })
      if ((s as any)?.streak?.hitMilestone) {
        setShowCelebration(true)
        setTimeout(() => setShowCelebration(false), 2500)
      }
      updateCountdown((p as any)?.prompt?.dropsAt)
      if ((p as any)?.posted) loadMyDaily()
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
    ;(async () => {
      try {
        const status = await Notifications.getPermissionsAsync()
        if (!status.granted) return
        const dropsAt = daily?.prompt?.dropsAt
        if (!dropsAt || daily?.posted) return
        const when = new Date(dropsAt)
        await Notifications.scheduleNotificationAsync({ content: { title: 'Daily Circle', body: 'Your Daily is open. Share a moment today.' }, trigger: when })
      } catch {}
    })()
  }, [daily?.prompt?.dropsAt, daily?.posted])

  useEffect(() => {
    const id = setInterval(() => updateCountdown(daily?.prompt?.dropsAt), 1000)
    return () => clearInterval(id)
  }, [daily?.prompt?.dropsAt])

  const loadFeed = async (p = 1, replace = false) => {
    if (feedLoadingMore && !replace) return
    setFeedLoadingMore(true)
    try {
      const res: any = await (api as any).getFeed(p, 10)
      const items: any[] = Array.isArray(res?.posts) ? res.posts : []
      setFeed((prev) => (replace ? items : p === 1 ? items : [...prev, ...items]))
      const totalPages = Number(res?.totalPages || 1)
      setFeedHasMore((res?.success !== false) && p < totalPages)
      setFeedPage(p)
    } catch {
      if (replace) setFeed([])
      setFeedHasMore(false)
    } finally {
      setFeedLoadingMore(false)
      setFeedRefreshing(false)
    }
  }

  const onFeedEndReached = () => {
    if (!feedHasMore || feedLoadingMore) return
    loadFeed(feedPage + 1)
  }

  const onFeedRefresh = async () => {
    setFeedRefreshing(true)
    await loadFeed(1, true)
  }

  const like = async (postId: string) => {
    try {
      await (api as any).likePost(postId)
      try {
        const res: any = await (api as any).getPostById(postId)
        if (res?.success && res?.post) {
          setFeed((prev) => prev.map((p) => (String(p._id) === String(postId) ? res.post : p)))
          return
        }
      } catch {}
      setFeed((prev) => prev.map((p) => (String(p._id) === String(postId) ? { ...p, likes: Array.isArray(p.likes) ? [...p.likes, 'x'] : ['x'] } : p)))
    } catch {}
  }

  const toggleSave = async (postId: string) => { try { await (api as any).toggleSave(postId) } catch {} }

  const timeAgo = (iso?: string) => {
    if (!iso) return ""
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (secs < 60) return "now"
    if (secs < 3600) return `${Math.floor(secs/60)}m`
    if (secs < 86400) return `${Math.floor(secs/3600)}h`
    if (secs < 604800) return `${Math.floor(secs/86400)}d`
    return `${Math.floor(secs/604800)}w`
  }

  const likedByMe = (item: any) => {
    if (!Array.isArray(item?.likes)) return false
    const me = String(currentUserId || '')
    return item.likes.some((u: any) => String(u?._id || u) === me)
  }
  const likedOptimistic = (item: any) => {
    const id = String(item?._id || '')
    if (likeLocalRef.current[id] != null) return likeLocalRef.current[id]
    return likedByMe(item)
  }
  const likesCountOptimistic = (item: any) => {
    const id = String(item?._id || '')
    const base = Array.isArray(item?.likes) ? item.likes.length : 0
    const adj = likeCountLocalRef.current[id]
    return adj != null ? adj : base
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#fafafa" }}>
      {showCelebration && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 140, justifyContent: 'center', alignItems: 'center' }} pointerEvents='none'>
          <Text style={{ fontSize: 24, fontWeight: '900' }}>🎉 Streak {daily?.streak?.current}!</Text>
        </View>
      )}
      <FlatList
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Image source={logo} resizeMethod="contain" style={styles.logo} />
              <TouchableOpacity style={styles.notificationButton} onPress={() => router.push('/notifications')}>
                <Ionicons name="heart-outline" size={28} color="#262626" />
                {unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{Math.min(99, unreadCount)}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.notificationButton, { marginLeft: 6 }]} onPress={() => router.push('/highlights')}>
                <Ionicons name="bookmark-outline" size={26} color="#262626" />
              </TouchableOpacity>
            </View>

            <View style={styles.storiesContainer}>
              {daily?.prompt && (
                <TouchableOpacity
                  style={{ backgroundColor: '#fff', borderWidth: 0, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8, overflow: 'hidden' }}
                  onPress={() => {
                    if (daily?.posted) router.push({ pathname: "/daily/viewer", params: { userId: currentUserId || "" } })
                    else router.push({ pathname: "/(tabs)/search", params: { focusDaily: "1", openComposer: "1" } })
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Image source={{ uri: myDaily?.mediaUrl || currentUserId ? (myDaily?.mediaUrl || 'https://i.pravatar.cc/100?img=12') : 'https://i.pravatar.cc/100?img=12' }} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#eee' }} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text numberOfLines={1} style={{ fontWeight: '800', fontSize: 16 }}>Daily Circle</Text>
                        {!!daily?.streak?.current && (
                          <View style={{ backgroundColor: '#fff3e0', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ color: '#e65100', fontWeight: '800' }}>🔥 {daily?.streak?.current}</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        {!!(daily as any)?.options && Array.isArray((daily as any).options) && ((daily as any).options as any[]).slice(0, 3).map((opt: any, idx: number) => (
                          <TouchableOpacity key={idx} onPress={() => router.push({ pathname: "/(tabs)/search", params: { focusDaily: '1', openComposer: '1', seedText: String(opt?.text || '') } })} style={{ backgroundColor: '#f5f5f5', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
                            <Text numberOfLines={1} style={{ color: '#333', maxWidth: 140 }}>{String(opt?.text || '').slice(0, 50)}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <View style={{ backgroundColor: daily?.posted ? '#e8f5e9' : '#fdecea', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 }}>
                        <Text style={{ color: daily?.posted ? '#2e7d32' : '#c62828', fontWeight: '700' }}>{daily?.posted && typeof daily?.streak?.current === 'number' ? `Streak ${daily?.streak?.current}` : 'Post to unlock'}</Text>
                      </View>
                      {!!countdown && (<Text numberOfLines={1} style={{ color: '#3f51b5', fontWeight: '700' }}>Drops in {countdown}</Text>)}
                      {!daily?.posted && (
                        <TouchableOpacity onPress={() => router.push({ pathname: "/(tabs)/search", params: { focusDaily: "1", openComposer: "1" } })} style={{ backgroundColor: '#0095f6', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
                          <Text style={{ color: '#fff', fontWeight: '800' }}>Post</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  <Text numberOfLines={2} ellipsizeMode='tail' style={{ marginTop: 8, color: '#333' }}>{daily?.prompt?.text}</Text>
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
                        <TouchableOpacity onPress={() => router.push({ pathname: "/daily/viewer", params: { userId: currentUserId || '' } })} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
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
                        renderItem={({ item, index }) => (
                          <DailyRing
                            imageUrl={item?.mediaUrl || item?.user?.profilePic || 'https://i.pravatar.cc/100?img=11'}
                            label={item?.user?.name || 'Friend'}
                            onPress={() => {
                              const ids = (daily?.rings || []).map((r: any) => r?.user?._id).filter(Boolean)
                              const start = index
                              router.push({ pathname: '/daily/viewer', params: { userIds: ids.join(','), start: String(start) } })
                            }}
                          />
                        )}
                      />
                    </View>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </>
        }
        data={feed}
        keyExtractor={(item) => String(item?._id || Math.random())}
        renderItem={({ item }) => {
          const user = item?.user || {}
          const likesCount = likesCountOptimistic(item)
          const liked = likedOptimistic(item)
          return (
            <View style={styles.postContainer}>
              <View style={styles.postHeader}>
                <Image source={{ uri: user?.profilePic || 'https://i.pravatar.cc/150?img=3' }} style={styles.userImage} />
                <View style={styles.userInfo}>
                  <Text style={styles.username}>{user?.name || 'User'}</Text>
                  {!!item?.locationName && <Text style={styles.location}>{item.locationName}</Text>}
                </View>
                <TouchableOpacity style={styles.menuButton}>
                  <Ionicons name="ellipsis-horizontal" size={20} color="#262626" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.postImageWrapper} onPress={() => router.push(`/post/${item._id}`)}>
                {/(\.mp4|\.mov|\.m4v|\.webm)$/i.test(String(item?.mediaUrl || '')) ? (
                  <Video
                    source={{ uri: item.mediaUrl }}
                    style={styles.postImage}
                    resizeMode="cover"
                    shouldPlay={false}
                    useNativeControls={false}
                    isLooping
                  />
                ) : (
                  <Image source={{ uri: item?.mediaUrl || 'https://i.pravatar.cc/500?img=21' }} style={styles.postImage} />
                )}
              </TouchableOpacity>
              <View style={styles.actions}>
                <View style={styles.leftActions}>
                  <TouchableOpacity style={styles.actionButton} onPress={async () => {
                    try { await Haptics.selectionAsync() } catch {}
                    const id = String(item._id)
                    const currently = likedOptimistic(item)
                    const baseCount = likesCountOptimistic(item)
                    likeLocalRef.current[id] = !currently
                    likeCountLocalRef.current[id] = Math.max(0, baseCount + (currently ? -1 : 1))
                    setFeed((prev) => [...prev])
                    try { await (api as any).likePost(id) } catch {
                      likeLocalRef.current[id] = currently
                      likeCountLocalRef.current[id] = baseCount
                      setFeed((prev) => [...prev])
                    }
                  }}>
                    <Ionicons name={liked ? 'heart' : 'heart-outline'} size={28} color={liked ? '#FF3040' : '#262626'} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton} onPress={() => router.push(`/post/${item._id}`)}>
                    <Ionicons name="chatbubble-outline" size={28} color="#262626" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton}>
                    <Ionicons name="paper-plane-outline" size={28} color="#262626" />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.actionButton} onPress={async () => { try { await Haptics.selectionAsync() } catch {} ; toggleSave(String(item._id)) }}>
                  <Ionicons name="bookmark-outline" size={28} color="#262626" />
                </TouchableOpacity>
              </View>
              <Text style={styles.likes}>❤️ {likesCount}</Text>
              <View style={styles.captionContainer}>
                <Text style={styles.caption}>
                  <Text style={styles.captionUsername}>{user?.name || 'User'} </Text>
                  {item?.title || item?.description || ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => router.push(`/post/${item._id}`)}>
                <Text style={styles.viewComments}>View comments</Text>
              </TouchableOpacity>
              <Text style={styles.timeAgo}>{timeAgo(item?.createdAt)}</Text>
            </View>
          )
        }}
        showsVerticalScrollIndicator={false}
        onEndReached={onFeedEndReached}
        onEndReachedThreshold={0.3}
        refreshing={feedRefreshing}
        onRefresh={onFeedRefresh}
        ListFooterComponent={feedLoadingMore ? (<View style={{ paddingVertical: 12, alignItems: 'center' }}><Text>Loading…</Text></View>) : null}
      />
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
  notificationButton: { padding: 8, position: 'relative' },
  storiesContainer: { paddingVertical: 16, backgroundColor: 'white', borderBottomWidth: 0.5, borderBottomColor: '#dbdbdb' },
  postContainer: { backgroundColor: 'white', marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  postHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingBottom: 8 },
  userImage: { height: 42, width: 42, borderRadius: 21, marginRight: 12, borderWidth: 0.5, borderColor: '#dbdbdb' },
  userInfo: { flex: 1 },
  username: { fontWeight: '600', fontSize: 14, color: '#262626' },
  location: { fontSize: 12, color: '#8e8e8e', marginTop: 1 },
  menuButton: { padding: 8 },
  postImage: { width: width - 2, height: width, borderRadius: 12 },
  postImageWrapper: { paddingHorizontal: 1, paddingTop: 1, backgroundColor: '#fff' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12 },
  leftActions: { flexDirection: 'row', gap: 16 },
  actionButton: { padding: 4 },
  likes: { fontWeight: '600', paddingHorizontal: 12, fontSize: 14, color: '#262626' },
  captionContainer: { paddingHorizontal: 12, paddingTop: 4 },
  caption: { fontSize: 14, lineHeight: 18, color: '#262626' },
  captionUsername: { fontWeight: '600', color: '#262626' },
  viewComments: { paddingHorizontal: 12, paddingTop: 4, fontSize: 14, color: '#8e8e8e' },
  timeAgo: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 12, fontSize: 12, color: '#8e8e8e', textTransform: 'uppercase' },
  logo: { height: 40, width: 120 },
  unreadBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: '#FF3040', borderRadius: 9, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'white' },
  unreadText: { color: 'white', fontSize: 10, fontWeight: 'bold', textAlign: 'center' },
})