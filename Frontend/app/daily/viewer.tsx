import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View, Dimensions, PanResponder, TextInput } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { Video } from "expo-av"
import api from "@/services/api.service"

const { width, height } = Dimensions.get('window')

export default function DailyViewer() {
  const { userId, groupId, userIds, start, dur } = useLocalSearchParams<{ userId?: string; groupId?: string; userIds?: string; start?: string; dur?: string }>()
  const router = useRouter()

  const sequence: string[] = useMemo(() => {
    if (groupId) return []
    const raw = (userIds || "").split(",").map((s) => s.trim()).filter(Boolean)
    if (raw.length > 0) return raw
    if (userId) return [String(userId)]
    return []
  }, [userIds, userId, groupId])

  const [currentUserIndex, setCurrentUserIndex] = useState(Math.max(0, Math.min(Number.parseInt(String(start || 0)) || 0, Math.max(0, sequence.length - 1))))
  const [entries, setEntries] = useState<any[]>([])
  const [entryIndex, setEntryIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState<number[]>([])
  const timerRef = useRef<any>(null)

  const defaultSegMs = Math.max(1000, Math.min(45000, Number.parseInt(String(dur || "")) || 5000))
  const segMsRef = useRef<number>(defaultSegMs)
  const videoRef = useRef<Video | null>(null)

  const isVideoUrl = (u?: string) => !!u && /\.(mp4|mov|m4v|webm)$/i.test(u)

  // Group mode: simple list of today's entries
  useEffect(() => {
    if (!groupId) return
    ;(async () => {
      setLoading(true)
      try {
        const res = await api.getGroupDailyFeed(String(groupId))
        const list = Array.isArray((res as any)?.entries) ? (res as any).entries : []
        setEntries(list)
        setEntryIndex(0)
        setProgress(Array.from({ length: list.length }, () => 0))
        segMsRef.current = defaultSegMs
      } catch {
        setEntries([])
        setError("Failed to load")
      } finally { setLoading(false) }
    })()
  }, [groupId, defaultSegMs])

  // Sequence mode: load entries for the active user
  useEffect(() => {
    if (groupId) return
    if (sequence.length === 0) { setLoading(false); return }
    const uid = sequence[currentUserIndex]
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await api.getDailyEntryByUser(String(uid))
        const list = Array.isArray((res as any)?.entries) ? (res as any).entries : []
        if (!cancelled) {
          if (list.length === 0) {
            if (currentUserIndex < sequence.length - 1) setCurrentUserIndex((i) => i + 1)
            else setEntries([])
          } else {
            setEntries(list)
            setEntryIndex(0)
            setProgress(Array.from({ length: list.length }, () => 0))
            segMsRef.current = defaultSegMs
          }
        }
      } catch {
        if (!cancelled) { setEntries([]); setError("Failed to load") }
      } finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [sequence, currentUserIndex, groupId, defaultSegMs])

  // Prefetch next media
  useEffect(() => {
    const next = entries[entryIndex + 1]
    if (next?.mediaUrl) Image.prefetch(next.mediaUrl)
  }, [entryIndex, entries])

  // Track view on entry change
  useEffect(() => {
    const entry = entries[entryIndex]
    if (!entry?._id) return
    ;(async () => { try { await api.dailyView(String(entry._id)) } catch {} })()
  }, [entryIndex, entries])

  // Reset segment duration when entry changes
  useEffect(() => {
    segMsRef.current = defaultSegMs
  }, [entryIndex, defaultSegMs])

  // Progress timer
  const clearTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
  const startTimer = () => {
    clearTimer()
    if (paused || loading || entries.length === 0) return
    const startedAt = Date.now()
    const duration = Math.max(500, segMsRef.current || defaultSegMs)
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt
      const frac = Math.min(1, elapsed / duration)
      setProgress((prev) => {
        const next = prev.slice()
        next[entryIndex] = frac
        for (let i = 0; i < entryIndex; i++) next[i] = 1
        for (let i = entryIndex + 1; i < next.length; i++) next[i] = Math.min(next[i] || 0, 0)
        return next
      })
      if (elapsed >= duration) {
        clearTimer()
        goNext()
      }
    }, 50)
  }

  useEffect(() => {
    startTimer()
    return clearTimer
  }, [entryIndex, entries, paused, loading])

  // Pause/resume video when paused state or entry changes
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    try {
      if (paused) v.pauseAsync()
      else v.playAsync()
    } catch {}
  }, [paused, entryIndex])

  const goNext = () => {
    if (entryIndex < entries.length - 1) {
      setEntryIndex((i) => i + 1)
    } else if (!groupId && currentUserIndex < sequence.length - 1) {
      setCurrentUserIndex((i) => i + 1)
    } else {
      router.back()
    }
  }

  const goPrev = () => {
    if (entryIndex > 0) {
      setEntryIndex((i) => i - 1)
    } else if (!groupId && currentUserIndex > 0) {
      setCurrentUserIndex((i) => Math.max(0, i - 1))
    } else {
      router.back()
    }
  }

  // Swipe down to dismiss
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 12,
    onPanResponderMove: () => {},
    onPanResponderRelease: (_, g) => { if (g.vy > 0.8 && g.dy > 80) router.back() },
  }), [router])

  // Reply box
  const [replyText, setReplyText] = useState("")
  const [sending, setSending] = useState(false)
  const onSend = async () => {
    const txt = replyText.trim()
    if (!txt) return
    setSending(true)
    try {
      if (groupId) await api.sendGroupMessage(String(groupId), txt)
      else if (entries[entryIndex]?.user?._id) await api.sendDirectMessage(String(entries[entryIndex].user._id), txt)
      setReplyText("")
    } catch (e) {
      // ignore for now
    } finally { setSending(false) }
  }

  if (loading) return (
    <View style={styles.container}><ActivityIndicator /></View>
  )

  if (!entries || entries.length === 0) return (
    <View style={styles.container}>
      <View style={{ paddingHorizontal: 20, alignItems: 'center' }}>
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: '700', textAlign: 'center' }}>{error || "No entry available"}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}>
          <Text style={{ color: "#000", fontWeight: '700' }}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  const item = entries[Math.max(0, Math.min(entryIndex, entries.length - 1))]

  return (
    <View style={{ width, height, backgroundColor: '#000' }} {...panResponder.panHandlers}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Progress bars */}
      <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingTop: 48 }}>
        {progress.map((p, idx) => (
          <View key={idx} style={{ flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(0, Math.min(1, (idx < entryIndex ? 1 : idx === entryIndex ? p : 0))) * 100}%`, height: 3, backgroundColor: '#fff' }} />
          </View>
        ))}
      </View>

      <View style={styles.header}>
        <Image source={{ uri: item?.user?.profilePic || "https://i.pravatar.cc/100?img=12" }} style={styles.avatar} />
        <View style={{ marginLeft: 10 }}>
          <Text style={styles.name}>{item?.user?.name || "User"}</Text>
          <Text style={styles.time}>{new Date(item?.createdAt).toLocaleTimeString()}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ color: '#fff', fontSize: 12 }}>{typeof item?.viewsCount === 'number' ? `${item.viewsCount} views` : ''}</Text>
          <TouchableOpacity onPress={async () => { try { await api.dailyHighlight(String(item._id), true) } catch {} }}>
            <Ionicons name="bookmark-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.body}>
        {isVideoUrl(item?.mediaUrl) ? (
          <Video
            ref={(r) => (videoRef.current = r)}
            source={{ uri: item.mediaUrl }}
            style={styles.media}
            resizeMode="contain"
            shouldPlay={!paused}
            isLooping={false}
            onLoad={(status: any) => {
              const ms = Math.max(1000, Math.min(45000, (status?.durationMillis as number) || defaultSegMs))
              segMsRef.current = ms
              // restart timer to sync with video duration
              if (!paused) { clearTimer(); startTimer() }
            }}
            onPlaybackStatusUpdate={(s: any) => {
              if (s?.didJustFinish) { clearTimer(); goNext() }
            }}
          />
        ) : item?.mediaUrl ? (
          <Image source={{ uri: item.mediaUrl }} style={styles.media} resizeMode="contain" />
        ) : (
          <View style={{ paddingHorizontal: 20 }}>
            <Text style={styles.textContent}>{item?.text || ""}</Text>
          </View>
        )}
      </View>
      {/* Tap/press zones: pause on press-in, resume on press-out */}
      <TouchableOpacity style={styles.leftZone} onPress={goPrev} onPressIn={() => setPaused(true)} onPressOut={() => setPaused(false)} activeOpacity={0.2} />
      <TouchableOpacity style={styles.rightZone} onPress={goNext} onPressIn={() => setPaused(true)} onPressOut={() => setPaused(false)} activeOpacity={0.2} />

      {/* Reactions */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 70, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center' }}>
          {['❤️','😂','🔥','😮','👏'].map((emoji) => (
            <TouchableOpacity key={emoji} onPress={async () => { try { await api.dailyReact(String(item._id), emoji) } catch {} }}>
              <Text style={{ fontSize: 24 }}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Reply box */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}>
          <TextInput
            style={{ flex: 1, color: '#fff', height: 40 }}
            placeholder={groupId ? 'Reply to group…' : 'Reply…'}
            placeholderTextColor="#ccc"
            value={replyText}
            onChangeText={setReplyText}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            returnKeyType="send"
            onSubmitEditing={onSend}
          />
          <TouchableOpacity onPress={onSend} disabled={sending || !replyText.trim()}>
            <Text style={{ color: sending || !replyText.trim() ? '#aaa' : '#fff', fontWeight: '800' }}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", alignItems: 'center', justifyContent: 'center' },
  topBar: { position: "absolute", top: 10, right: 16, zIndex: 10 },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 14, paddingHorizontal: 16 },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  name: { color: "#fff", fontWeight: "700" },
  time: { color: "#ccc", fontSize: 12 },
  body: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },
  media: { width: "100%", height: "80%" },
  textContent: { color: "#fff", fontSize: 20, textAlign: "center" },
  leftZone: { position: 'absolute', left: 0, top: 0, bottom: 0, width: width * 0.35 },
  rightZone: { position: 'absolute', right: 0, top: 0, bottom: 0, width: width * 0.65 },
})

