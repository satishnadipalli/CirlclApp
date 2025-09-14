import { useEffect, useState, useRef } from "react"
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
  ScrollView,
  Modal,
  Share,
  Animated,
} from "react-native"
import * as ImagePicker from "expo-image-picker"
import { Camera } from "expo-camera"
import { useLocalSearchParams, useRouter } from "expo-router"
import { apiService } from "@/services/api.service"
import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "@react-native-async-storage/async-storage"
import * as Haptics from "expo-haptics"

const Search = () => {
  const [query, setQuery] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const debounceRef = useRef(null)
  const [explore, setExplore] = useState([])
  const [dailyFeed, setDailyFeed] = useState<any[]>([])
  const [showDaily, setShowDaily] = useState(false)
  const [tab, setTab] = useState<'explore' | 'daily' | 'groups'>('explore')
  const [showComposer, setShowComposer] = useState(false)
  const [composingText, setComposingText] = useState("")
  const [visibility, setVisibility] = useState<'followers' | 'everyone' | 'closeFriends'>('followers')
  const [posting, setPosting] = useState(false)
  const [pickedUri, setPickedUri] = useState<string | null>(null)
  const [isVideo, setIsVideo] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const loadingMoreRef = useRef(false)
  const [refreshing, setRefreshing] = useState(false)
  const [dailyPage, setDailyPage] = useState(1)
  const [dailyHasMore, setDailyHasMore] = useState(true)
  const [dailyLocked, setDailyLocked] = useState(false)
  const [groups, setGroups] = useState<any[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [groupCounts, setGroupCounts] = useState<Record<string, number>>({})
  const [postToGroup, setPostToGroup] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [streak, setStreak] = useState<{ current?: number; longest?: number; nextMilestone?: number | null; hitMilestone?: boolean } | null>(null)
  const [showMilestone, setShowMilestone] = useState(false)
  const router = useRouter()
  const params = useLocalSearchParams() as any
  const openHandledRef = useRef(false)
  const focusDailyHandledRef = useRef(false)

  // New: search recents and filters state
  const RECENTS_KEY = 'recent_searches_v1'
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [nearbyEnabled, setNearbyEnabled] = useState(false)
  const [radiusKm, setRadiusKm] = useState<15 | 25 | 50>(25)

  // Long-press preview state
  const [previewPost, setPreviewPost] = useState<any | null>(null)
  const [previewVisible, setPreviewVisible] = useState(false)
  const scaleAnim = useRef(new Animated.Value(0.95)).current
  const opacityAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    loadExplore(1, true)
    loadRecentSearches()
  }, [])

  useEffect(() => {
    if (params?.focusDaily === "1" && !focusDailyHandledRef.current) {
      focusDailyHandledRef.current = true
      setShowDaily(true)
      setTab('daily')
      loadDaily(true)
      loadStreak()
    }
  }, [params?.focusDaily])

  // Seed composer from params
  useEffect(() => {
    try {
      const f = String(params?.focusDaily || '')
      const oc = String(params?.openComposer || '')
      const seed = String(params?.seedText || '')
      if (f === '1') setTab('daily')
      if (oc === '1') setShowComposer(true)
      if (seed) setComposingText(seed)
    } catch {}
  }, [params?.focusDaily, params?.openComposer, params?.seedText])

  useEffect(() => {
    if (tab === 'groups') loadGroups()
    if (tab === 'daily') { loadStreak() }
  }, [tab])

  const loadDaily = async (reset = false) => {
    try {
      if (loadingMoreRef.current) return
      loadingMoreRef.current = true
      const nextPage = reset ? 1 : dailyPage
      const res = await apiService.getDailyFeed()
      if (!res?.success && (res as any)?.locked) {
        setDailyFeed([])
        setDailyHasMore(false)
        setDailyPage(1)
        setDailyLocked(true)
        return
      }
      const entries = (res as any)?.entries || []
      setDailyFeed((prev) => (reset ? entries : [...prev, ...entries]))
      // Server currently returns all for the day; simple hasMore=false
      setDailyHasMore(false)
      setDailyPage(nextPage + 1)
      setDailyLocked(false)
    } catch (e) {
      if (reset) setDailyFeed([])
    } finally {
      loadingMoreRef.current = false
    }
  }

  // Recent searches helpers
  const loadRecentSearches = async () => {
    try {
      const raw = await AsyncStorage.getItem(RECENTS_KEY)
      const arr = raw ? JSON.parse(raw) : []
      if (Array.isArray(arr)) setRecentSearches(arr.filter((s: any) => typeof s === 'string'))
    } catch {}
  }
  const addRecentSearch = async (q: string) => {
    try {
      const t = q.trim()
      if (t.length < 2) return
      const next = [t, ...recentSearches.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 10)
      setRecentSearches(next)
      await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next))
    } catch {}
  }
  const clearRecentSearches = async () => {
    try { await AsyncStorage.removeItem(RECENTS_KEY); setRecentSearches([]) } catch {}
  }

  const loadStreak = async () => {
    try {
      const res: any = await apiService.getDailyStreak()
      if (res?.success && res?.streak) {
        setStreak(res.streak)
        const cur = Number(res.streak.current || 0)
        const hit = Boolean(res.streak.hitMilestone)
        if (hit && cur > 0) {
          try {
            const last = Number(await AsyncStorage.getItem('daily_last_milestone') || '0')
            if (cur > last) setShowMilestone(true)
          } catch { setShowMilestone(true) }
        } else {
          setShowMilestone(false)
        }
      }
    } catch {}
  }

  const onDailyEndReached = () => {
    if (tab !== 'daily' || !dailyHasMore || loadingMoreRef.current) return
    loadDaily()
  }

  const loadGroups = async () => {
    try {
      setGroupsLoading(true)
      const res: any = await apiService.getUserGroups()
      const gs = Array.isArray(res?.groups) ? res.groups : []
      setGroups(gs)
      const counts: Record<string, number> = {}
      await Promise.all(gs.map(async (g: any) => {
        try {
          const gr: any = await apiService.getGroupDailyFeed(String(g._id))
          const entries = Array.isArray(gr?.entries) ? gr.entries : []
          counts[String(g._id)] = entries.length
        } catch {}
      }))
      setGroupCounts(counts)
    } finally {
      setGroupsLoading(false)
    }
  }

  const submitDaily = async () => {
    if (posting) return
    setPosting(true)
    try {
      let r: any
      if (postToGroup && selectedGroupId) {
        r = await apiService.postGroupDailyEntry(String(selectedGroupId), { text: composingText, fileUri: pickedUri || undefined })
      } else {
        r = await apiService.postDailyEntry({ text: composingText, fileUri: pickedUri || undefined, visibility })
      }
      if (r?.success) {
        setShowComposer(false)
        setComposingText("")
        setPickedUri(null)
        setIsVideo(false)
        setVisibility('followers')
        setPostToGroup(false)
        setSelectedGroupId(null)
        await loadDaily(true)
        await loadGroups()
        setTab('daily')
        setShowDaily(true)
        try { (router as any)?.setParams?.({ openComposer: '0' }) } catch {}
      }
    } finally {
      setPosting(false)
    }
  }

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') return
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.8, videoMaxDuration: 30 })
    if (!res.canceled && res.assets?.length) {
      const a = res.assets[0]
      setPickedUri(a.uri)
      setIsVideo(!!a.duration && a.duration > 0)
    }
  }

  const recordFromCamera = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync()
    if (status !== 'granted') return
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.8, videoMaxDuration: 30 })
    if (!res.canceled && res.assets?.length) {
      const a = res.assets[0]
      setPickedUri(a.uri)
      setIsVideo(!!a.duration && a.duration > 0)
    }
  }

  const loadExplore = async (p = 1, replace = false) => {
    if (loadingMoreRef.current) return
    loadingMoreRef.current = true
    try {
      let res: any
      let items: any[] = []
      if (nearbyEnabled) {
        try {
          const coordsRaw = await AsyncStorage.getItem("user_coords")
          const c = coordsRaw ? JSON.parse(coordsRaw) : null
          if (c?.lat != null && c?.lng != null) {
            res = await apiService.getNearbyFeed(Number(c.lat), Number(c.lng), Number(radiusKm), p, 18)
            items = (res && (res.posts || [])) || []
          } else {
            res = await apiService.getExplore(p, 18)
            items = (res && (res.posts || [])) || []
          }
        } catch {
          res = await apiService.getExplore(p, 18)
          items = (res && (res.posts || [])) || []
        }
      } else {
        res = await apiService.getExplore(p, 18)
        items = (res && (res.posts || [])) || []
      }
      setExplore((prev) => (replace ? items : p === 1 ? items : [...prev, ...items]))
      setHasMore((res && res.hasMore) ?? items.length > 0)
      setPage(p)
    } catch {}
    finally { loadingMoreRef.current = false }
  }

  const onEndReached = () => {
    if (!isSearching && hasMore && !loadingMoreRef.current) loadExplore(page + 1)
  }

  const openPreview = async (item: any) => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {}
    setPreviewPost(item)
    setPreviewVisible(true)
    try {
      scaleAnim.setValue(0.95)
      opacityAnim.setValue(0)
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 1, duration: 140, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 140, useNativeDriver: true }),
      ]).start()
    } catch {}
  }
  const closePreview = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, { toValue: 0.95, duration: 120, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) { setPreviewVisible(false); setPreviewPost(null) }
    })
  }
  const onLike = async () => {
    if (!previewPost?._id) return
    try { await apiService.likePost(String(previewPost._id)) } catch {}
    closePreview()
  }
  const onSave = async () => {
    if (!previewPost?._id) return
    try { await apiService.toggleSave(String(previewPost._id)) } catch {}
    closePreview()
  }
  const onShare = async () => {
    try {
      const link = previewPost?.shareUrl || previewPost?.mediaUrl || ""
      await Share.share({ message: link || "Check this post on CirclApp" })
    } catch {}
    closePreview()
  }

  const onChangeQuery = (text) => {
    setQuery(text)
    const q = text.trim()
    const shouldSearch = q.length >= 2
    setIsSearching(shouldSearch)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!shouldSearch) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      try {
        setSearchLoading(true)
        const res = await apiService.searchUsers(q, 1, 20)
        const users = Array.isArray(res?.users) ? res.users : []
        setSearchResults(users)
        addRecentSearch(q).catch(() => {})
      } catch {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 300)
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await loadExplore(1, true)
    setRefreshing(false)
  }

  const useLatePass = async () => {
    const r: any = await apiService.useLatePass()
    if (r?.success) {
      await loadDaily(true)
      setTab('daily')
      setShowDaily(true)
    }
  }

  const shareMilestone = async () => {
    try {
      const cur = streak?.current || 0
      await Share.share({ message: `I just hit a ${cur}-day Daily streak on CirclApp!` })
    } catch {}
    try { await AsyncStorage.setItem('daily_last_milestone', String(streak?.current || 0)) } catch {}
    setShowMilestone(false)
  }

  const StreakHeader = () => {
    if (!streak) return null
    return (
      <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="flame" size={18} color="#ff7a00" />
            <Text style={{ fontWeight: '800', color: '#000' }}>Streak</Text>
          </View>
          <Text style={{ color: '#666', fontSize: 12 }}>Longest {streak.longest || 0}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 }}>
          <Text style={{ fontSize: 28, fontWeight: '900', color: '#000' }}>{streak.current || 0}</Text>
          {!!streak.nextMilestone && (
            <View style={{ backgroundColor: '#f2f2f2', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: '#666', fontWeight: '700' }}>Next: {streak.nextMilestone}</Text>
            </View>
          )}
        </View>
        {showMilestone && (
          <View style={{ marginTop: 8, backgroundColor: '#f6f7ff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#eef0ff' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800', color: '#000' }}>🎉 Milestone unlocked!</Text>
              <TouchableOpacity onPress={() => setShowMilestone(false)}>
                <Ionicons name="close" size={18} color="#999" />
              </TouchableOpacity>
            </View>
            <Text style={{ color: '#444', marginTop: 6 }}>You hit a {streak.current}-day streak. Keep it going!</Text>
            <TouchableOpacity onPress={shareMilestone} style={{ alignSelf: 'flex-start', marginTop: 10, backgroundColor: '#0095f6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Share</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', marginTop: 12, marginHorizontal: 10, borderRadius: 10, backgroundColor: '#f2f2f2', overflow: 'hidden' }}>
        <TouchableOpacity style={{ flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: tab === 'explore' ? '#fff' : 'transparent' }} onPress={() => setTab('explore')}>
          <Text style={{ fontWeight: '700', color: tab === 'explore' ? '#000' : '#666' }}>Explore</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: tab === 'daily' ? '#fff' : 'transparent' }} onPress={() => { setTab('daily'); setShowDaily(true); loadDaily(true); loadStreak() }}>
          <Text style={{ fontWeight: '700', color: tab === 'daily' ? '#000' : '#666' }}>Daily</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: tab === 'groups' ? '#fff' : 'transparent' }} onPress={() => { setTab('groups') }}>
          <Text style={{ fontWeight: '700', color: tab === 'groups' ? '#000' : '#666' }}>Groups</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={20} color="#666" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search users"
          placeholderTextColor="#999"
          value={query}
          onChangeText={onChangeQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => addRecentSearch(query)}
        />
        <TouchableOpacity onPress={() => setShowFilters(true)} style={{ padding: 6 }}>
          <Ionicons name="options-outline" size={18} color="#666" />
        </TouchableOpacity>
        {query.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              setQuery("")
              setIsSearching(false)
              setSearchResults([])
            }}
            style={styles.clearBtn}
          >
            <Ionicons name="close" size={16} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {isSearching ? (
        <FlatList
          key="users-list"
          data={searchResults}
          keyExtractor={(item, idx) => item._id || String(idx)}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.userRow}
              onPress={() => { addRecentSearch(query); router.push(`/otherProfile?userId=${item._id}`) }}
            >
              <Image
                source={{ uri: item.profilePic || "https://i.pravatar.cc/100?img=12" }}
                style={styles.userAvatar}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{item.name}</Text>
                {!!item.username && <Text style={styles.userUsername}>@{item.username}</Text>}
              </View>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          numColumns={1}
          ListEmptyComponent={() => (
            <View style={{ padding: 20, alignItems: "center" }}>
              {searchLoading ? <ActivityIndicator /> : <Text style={{ color: "#666" }}>No users found</Text>}
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      ) : tab === 'daily' ? (
        <FlatList
          key="daily-list"
          data={dailyFeed}
          keyExtractor={(item, idx) => item._id || String(idx)}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.dailyRow} activeOpacity={0.8} onPress={() => router.push({ pathname: "/daily/viewer", params: { userId: item?.user?._id } })}>
              <Image source={{ uri: item.user?.profilePic || "https://i.pravatar.cc/100?img=16" }} style={styles.userAvatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{item.user?.name || "User"}</Text>
                {!!item.text && <Text style={styles.dailyText} numberOfLines={2}>{item.text}</Text>}
              </View>
              {item.mediaUrl ? (
                <Image source={{ uri: item.mediaUrl }} style={styles.dailyThumb} />
              ) : null}
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          onRefresh={() => { loadDaily(true); loadStreak() }}
          refreshing={false}
          onEndReached={onDailyEndReached}
          onEndReachedThreshold={0.4}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListHeaderComponent={<StreakHeader />}
          ListEmptyComponent={() => (
            <View style={{ padding: 20, alignItems: "center" }}>
              <Text style={{ color: "#666", marginBottom: 12 }}>Post today to unlock your Daily Circle</Text>
              <TouchableOpacity style={styles.cta} onPress={() => setShowComposer(true)}>
                <Text style={styles.ctaText}>Post now</Text>
              </TouchableOpacity>
              {dailyLocked && (
                <TouchableOpacity style={[styles.cta, { marginTop: 10, backgroundColor: '#6c5ce7' }]} onPress={useLatePass}>
                  <Text style={styles.ctaText}>Use Late Pass</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      ) : tab === 'groups' ? (
        <FlatList
          key="groups-list"
          data={groups}
          keyExtractor={(item, idx) => item._id || String(idx)}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.userRow} onPress={() => router.push({ pathname: "/daily/viewer", params: { groupId: item._id } })}>
              <Image source={{ uri: item.groupPic || "https://i.pravatar.cc/100?img=18" }} style={styles.userAvatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{item.name}</Text>
                <Text style={{ color: '#666', fontSize: 12 }}>
                  {(() => {
                    const posted = groupCounts[String(item._id)] || 0
                    const total = Array.isArray(item?.members) ? item.members.length : undefined
                    if (typeof total === 'number' && total > 0) {
                      const pct = Math.round((posted / total) * 100)
                      return `${posted}/${total} posted today (${pct}%)`
                    }
                    return `${posted} posted today`
                  })()}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          onRefresh={loadGroups}
          refreshing={groupsLoading}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={() => (
            <View style={{ padding: 20, alignItems: "center" }}>
              <Text style={{ color: "#666", marginBottom: 12 }}>{groupsLoading ? 'Loading…' : 'No groups yet'}</Text>
            </View>
          )}
        />
      ) : (
        <FlatList
          key="grid-3"
          data={explore}
          keyExtractor={(item, idx) => item._id || String(idx)}
          renderItem={({ item }) => (
            <TouchableOpacity activeOpacity={0.8} onLongPress={() => openPreview(item)} style={{ position: 'relative' }}>
              <Image
                source={{ uri: item.mediaUrl || "https://i.pravatar.cc/500?img=21" }}
                style={styles.image}
              />
              {(/(\.mp4|\.mov|\.m4v|\.webm)$/i).test(String(item?.mediaUrl || '')) && (
                <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="play-circle" size={26} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          )}
          numColumns={3}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListFooterComponent={() =>
            loadingMoreRef.current ? (
              <View style={{ paddingVertical: 12 }}>
                <ActivityIndicator />
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 20 }}
          ListHeaderComponent={() => (
            <View>
              {recentSearches.length > 0 && (
                <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: '#000', fontWeight: '800' }}>Recent searches</Text>
                    <TouchableOpacity onPress={clearRecentSearches}><Text style={{ color: '#007aff', fontWeight: '700' }}>Clear</Text></TouchableOpacity>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
                    {recentSearches.map((s) => (
                      <TouchableOpacity key={s} onPress={() => onChangeQuery(s)} style={{ backgroundColor: '#f2f2f2', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
                        <Text style={{ color: '#333' }}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          )}
        />
      )}

      {/* Long-press preview modal */}
      <Modal visible={previewVisible} transparent animationType="none" onRequestClose={closePreview}>
        <Animated.View style={{ flex: 1, backgroundColor: opacityAnim.interpolate({ inputRange: [0,1], outputRange: ['rgba(0,0,0,0)','rgba(0,0,0,0.35)'] }), justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} activeOpacity={1} onPress={closePreview} />
          <Animated.View style={{ transform: [{ scale: scaleAnim }], width: width * 0.9, borderRadius: 16, overflow: 'hidden', backgroundColor: '#111' }}>
            {previewPost?.mediaUrl ? (
              <Image source={{ uri: previewPost.mediaUrl }} style={{ width: '100%', height: width * 0.9 }} resizeMode="cover" />
            ) : (
              <View style={{ width: '100%', height: width * 0.9, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="image" size={36} color="#666" />
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 12, backgroundColor: '#fff' }}>
              <TouchableOpacity onPress={onLike} style={{ alignItems: 'center' }}>
                <Ionicons name="heart" size={22} color="#ef4444" />
                <Text style={{ marginTop: 4, color: '#111', fontWeight: '700' }}>Like</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onSave} style={{ alignItems: 'center' }}>
                <Ionicons name="bookmark" size={22} color="#111827" />
                <Text style={{ marginTop: 4, color: '#111', fontWeight: '700' }}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onShare} style={{ alignItems: 'center' }}>
                <Ionicons name="share-social" size={22} color="#0ea5e9" />
                <Text style={{ marginTop: 4, color: '#111', fontWeight: '700' }}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={closePreview} style={{ alignItems: 'center' }}>
                <Ionicons name="close" size={22} color="#6b7280" />
                <Text style={{ marginTop: 4, color: '#111', fontWeight: '700' }}>Close</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Filters modal */}
      <Modal visible={showFilters} animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, paddingTop: 50, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
            <Text style={{ fontWeight: '800', fontSize: 18 }}>Explore filters</Text>
            <TouchableOpacity onPress={() => setShowFilters(false)} style={{ backgroundColor: '#f2f2f2', padding: 8, borderRadius: 999 }}>
              <Ionicons name="close" size={20} color="#333" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <View style={{ marginBottom: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: '#000', fontWeight: '800' }}>Show nearby</Text>
                <TouchableOpacity onPress={() => setNearbyEnabled(!nearbyEnabled)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: nearbyEnabled ? '#0095f6' : '#eee' }}>
                  <Text style={{ color: nearbyEnabled ? '#fff' : '#000', fontWeight: '700' }}>{nearbyEnabled ? 'On' : 'Off'}</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ color: '#666', marginTop: 6 }}>Uses your saved location to prioritize close posts.</Text>
            </View>
            {nearbyEnabled && (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ color: '#000', fontWeight: '800', marginBottom: 8 }}>Radius</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[15,25,50].map((r) => (
                    <TouchableOpacity key={r} onPress={() => setRadiusKm(r as any)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: radiusKm === r ? '#0095f6' : '#f2f2f2' }}>
                      <Text style={{ color: radiusKm === r ? '#fff' : '#000', fontWeight: '700' }}>{r} km</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#eee' }}>
            <TouchableOpacity onPress={() => { setShowFilters(false); loadExplore(1, true) }} style={styles.primaryBtn}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showComposer} animationType="slide" onRequestClose={() => setShowComposer(false)}>
        <View style={{ flex: 1, backgroundColor: "#fff" }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, paddingTop: 50, borderBottomWidth: 1, borderBottomColor: "#eee" }}>
            <Text style={{ fontWeight: "800", fontSize: 18 }}>Post Daily</Text>
            <TouchableOpacity onPress={() => setShowComposer(false)} style={{ backgroundColor: '#f2f2f2', padding: 8, borderRadius: 999 }}>
              <Ionicons name="close" size={20} color="#333" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
            <Text style={{ marginBottom: 12, color: "#666" }}>Share a small moment (disappears in 24h)</Text>

            {pickedUri ? (
              <View style={{ marginBottom: 12 }}>
                <Image source={{ uri: pickedUri }} style={{ width: '100%', height: 260, borderRadius: 14, backgroundColor: '#eee' }} resizeMode="cover" />
                <TouchableOpacity onPress={() => { setPickedUri(null); setIsVideo(false) }} style={{ position: 'absolute', right: 10, top: 10, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Remove</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <TouchableOpacity style={[styles.cta, { backgroundColor: '#eee', flex: 1 }]} onPress={pickFromGallery}>
                  <Text style={[styles.ctaText, { color: '#000' }]}>Pick from Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cta, { backgroundColor: '#eee', flex: 1 }]} onPress={recordFromCamera}>
                  <Text style={[styles.ctaText, { color: '#000' }]}>Open Camera</Text>
                </TouchableOpacity>
              </View>
            )}

            <TextInput
              style={{ minHeight: 100, borderWidth: 1, borderColor: "#e6e6e6", backgroundColor: '#fafafa', borderRadius: 12, padding: 12, color: "#000" }}
              placeholder="Say something... (optional)"
              placeholderTextColor="#999"
              value={composingText}
              onChangeText={setComposingText}
              multiline
              maxLength={300}
            />
            <View style={{ alignItems: 'flex-end', marginTop: 6 }}>
              <Text style={{ color: '#999', fontSize: 12 }}>{composingText.length}/300</Text>
            </View>

            <View style={{ marginTop: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: '#666' }}>Post to a Group</Text>
                <TouchableOpacity onPress={() => { const next = !postToGroup; setPostToGroup(next); if (next && groups.length === 0) loadGroups() }} style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: postToGroup ? '#0095f6' : '#eee', borderRadius: 999 }}>
                  <Text style={{ color: postToGroup ? '#fff' : '#000', fontWeight: '700' }}>{postToGroup ? 'On' : 'Off'}</Text>
                </TouchableOpacity>
              </View>
              {postToGroup && (
                <View style={{ marginTop: 10 }}>
                  {groupsLoading ? (
                    <Text style={{ color: '#666' }}>Loading groups…</Text>
                  ) : groups.length === 0 ? (
                    <Text style={{ color: '#666' }}>You have no groups.</Text>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {groups.map((g: any) => (
                        <TouchableOpacity key={String(g._id)} onPress={() => setSelectedGroupId(String(g._id))} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: selectedGroupId === String(g._id) ? '#0095f6' : '#eee' }}>
                          <Text style={{ color: selectedGroupId === String(g._id) ? '#fff' : '#000', fontWeight: '700' }}>{g.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>
              )}
            </View>

            {!postToGroup && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ color: '#666', marginBottom: 8 }}>Visibility</Text>
                <View style={{ flexDirection: 'row', backgroundColor: '#f2f2f2', borderRadius: 10, padding: 4 }}>
                  <TouchableOpacity onPress={() => setVisibility('followers')} style={{ flex: 1, backgroundColor: visibility === 'followers' ? '#fff' : 'transparent', borderRadius: 8, alignItems: 'center', paddingVertical: 10 }}>
                    <Text style={{ fontWeight: '700', color: visibility === 'followers' ? '#000' : '#666' }}>Followers</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setVisibility('everyone')} style={{ flex: 1, backgroundColor: visibility === 'everyone' ? '#fff' : 'transparent', borderRadius: 8, alignItems: 'center', paddingVertical: 10 }}>
                    <Text style={{ fontWeight: '700', color: visibility === 'everyone' ? '#000' : '#666' }}>Everyone</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setVisibility('closeFriends' as any)} style={{ flex: 1, backgroundColor: visibility === 'closeFriends' ? '#fff' : 'transparent', borderRadius: 8, alignItems: 'center', paddingVertical: 10 }}>
                    <Text style={{ fontWeight: '700', color: visibility === 'closeFriends' ? '#000' : '#666' }}>Close Friends</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' }}>
            {(() => {
              const disabled = posting || (!pickedUri && composingText.trim().length === 0) || (postToGroup && !selectedGroupId)
              return (
                <TouchableOpacity
                  style={[styles.primaryBtn, disabled && { opacity: 0.6 }]}
                  onPress={submitDaily}
                  disabled={disabled}
                >
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{posting ? 'Posting…' : 'Post Daily'}</Text>
                </TouchableOpacity>
              )
            })()}
          </View>
        </View>
      </Modal>
    </View>
  )
}

const { width } = Dimensions.get("window")
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 0,
    marginHorizontal: 10,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#f2f2f2",
  },
  searchInput: { flex: 1, height: 40, color: "#000" },
  clearBtn: { padding: 6 },
  image: { width: width / 3, height: width / 3 },
  userRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 },
  userAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10, backgroundColor: "#eee" },
  userName: { fontSize: 16, fontWeight: "600", color: "#000" },
  userUsername: { fontSize: 12, color: "#666" },
  sep: { height: 1, backgroundColor: "#eee", marginLeft: 62 },
  dailyRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12 },
  dailyText: { fontSize: 13, color: "#444" },
  dailyThumb: { width: 54, height: 54, borderRadius: 8, marginLeft: 10, backgroundColor: "#eee" },
  cta: { backgroundColor: "#0095f6", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  ctaText: { color: "#fff", fontWeight: "700" },
  primaryBtn: { backgroundColor: '#0095f6', alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 12 },
})

export default Search