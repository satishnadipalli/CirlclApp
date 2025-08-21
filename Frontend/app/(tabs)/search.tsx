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
} from "react-native"
import * as ImagePicker from "expo-image-picker"
import * as Camera from "expo-camera"
import { useLocalSearchParams, useRouter } from "expo-router"
import { apiService } from "@/services/api.service"
import { Ionicons } from "@expo/vector-icons"

const Search = () => {
  const [query, setQuery] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const debounceRef = useRef(null)
  const [explore, setExplore] = useState([])
  const [dailyFeed, setDailyFeed] = useState([])
  const [showDaily, setShowDaily] = useState(false)
  const [tab, setTab] = useState<'explore' | 'daily'>('explore')
  const [showComposer, setShowComposer] = useState(false)
  const [composingText, setComposingText] = useState("")
  const [visibility, setVisibility] = useState<'followers' | 'everyone'>('followers')
  const [posting, setPosting] = useState(false)
  const [pickedUri, setPickedUri] = useState<string | null>(null)
  const [isVideo, setIsVideo] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const loadingMoreRef = useRef(false)
  const [refreshing, setRefreshing] = useState(false)
  const router = useRouter()
  const params = useLocalSearchParams()
  const openHandledRef = useRef(false)

  useEffect(() => {
    loadExplore(1, true)
  }, [])

  useEffect(() => {
    if (params?.focusDaily === "1") {
      setShowDaily(true)
      setTab('daily')
      loadDaily()
    }
    if (!openHandledRef.current && params?.openComposer === "1") {
      openHandledRef.current = true
      setShowComposer(true)
    }
    if (!openHandledRef.current && params?.openComposer === "0") {
      openHandledRef.current = true
      setShowComposer(false)
    }
  }, [params])

  const loadDaily = async () => {
    try {
      const res = await apiService.getDailyFeed()
      if (!res?.success && (res as any)?.locked) {
        setDailyFeed([])
        return
      }
      const entries = (res as any)?.entries || []
      setDailyFeed(Array.isArray(entries) ? entries : [])
    } catch (e) {
      setDailyFeed([])
    }
  }

  const submitDaily = async () => {
    if (posting) return
    setPosting(true)
    try {
      const r = await apiService.postDailyEntry({ text: composingText, fileUri: pickedUri || undefined, visibility })
      if (r?.success) {
        setShowComposer(false)
        setComposingText("")
        setPickedUri(null)
        setIsVideo(false)
        setVisibility('followers')
        await loadDaily()
        setTab('daily')
        setShowDaily(true)
        // Prevent re-opening composer if param was set
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
      const res = await apiService.getExplore(p, 18)
      const items = (res && (res.posts || []))
      setExplore((prev) => (replace ? items : p === 1 ? items : [...prev, ...items]))
      setHasMore((res && res.hasMore) ?? items.length > 0)
      setPage(p)
    } catch {}
    finally { loadingMoreRef.current = false }
  }

  const onEndReached = () => {
    if (!isSearching && hasMore && !loadingMoreRef.current) loadExplore(page + 1)
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

  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', marginTop: 12, marginHorizontal: 10, borderRadius: 10, backgroundColor: '#f2f2f2', overflow: 'hidden' }}>
        <TouchableOpacity style={{ flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: tab === 'explore' ? '#fff' : 'transparent' }} onPress={() => setTab('explore')}>
          <Text style={{ fontWeight: '700', color: tab === 'explore' ? '#000' : '#666' }}>Explore</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: tab === 'daily' ? '#fff' : 'transparent' }} onPress={() => { setTab('daily'); setShowDaily(true); loadDaily() }}>
          <Text style={{ fontWeight: '700', color: tab === 'daily' ? '#000' : '#666' }}>Daily</Text>
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
        />
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
              onPress={() => router.push(`/otherProfile?userId=${item._id}`)}
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
            <TouchableOpacity style={styles.dailyRow} activeOpacity={0.8}>
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
          onRefresh={loadDaily}
          refreshing={false}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={() => (
            <View style={{ padding: 20, alignItems: "center" }}>
              <Text style={{ color: "#666", marginBottom: 12 }}>Post today to unlock your Daily Circle</Text>
              <TouchableOpacity style={styles.cta} onPress={() => setShowComposer(true)}>
                <Text style={styles.ctaText}>Post now</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      ) : (
        <FlatList
          key="grid-3"
          data={explore}
          keyExtractor={(item, idx) => item._id || String(idx)}
          renderItem={({ item }) => (
            <Image
              source={{ uri: item.mediaUrl || "https://i.pravatar.cc/500?img=21" }}
              style={styles.image}
            />
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
        />
      )}

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
              <Text style={{ color: '#666', marginBottom: 8 }}>Visibility</Text>
              <View style={{ flexDirection: 'row', backgroundColor: '#f2f2f2', borderRadius: 10, padding: 4 }}>
                <TouchableOpacity onPress={() => setVisibility('followers')} style={{ flex: 1, backgroundColor: visibility === 'followers' ? '#fff' : 'transparent', borderRadius: 8, alignItems: 'center', paddingVertical: 10 }}>
                  <Text style={{ fontWeight: '700', color: visibility === 'followers' ? '#000' : '#666' }}>Followers</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setVisibility('everyone')} style={{ flex: 1, backgroundColor: visibility === 'everyone' ? '#fff' : 'transparent', borderRadius: 8, alignItems: 'center', paddingVertical: 10 }}>
                  <Text style={{ fontWeight: '700', color: visibility === 'everyone' ? '#000' : '#666' }}>Everyone</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' }}>
            {(() => {
              const disabled = posting || (!pickedUri && composingText.trim().length === 0)
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
    marginTop: 50,
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