import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useMemo, useState } from "react"
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View, Dimensions } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import api from "@/services/api.service"

const { width, height } = Dimensions.get('window')

export default function DailyViewer() {
  const { userId, groupId, userIds, start } = useLocalSearchParams<{ userId?: string; groupId?: string; userIds?: string; start?: string }>()
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

  // Group mode: simple list of today's entries
  useEffect(() => {
    if (!groupId) return
    (async () => {
      setLoading(true)
      try {
        const res = await api.getGroupDailyFeed(String(groupId))
        const list = Array.isArray((res as any)?.entries) ? (res as any).entries : []
        setEntries(list)
        setEntryIndex(0)
      } catch {
        setEntries([])
        setError("Failed to load")
      } finally { setLoading(false) }
    })()
  }, [groupId])

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
            // Skip users with no entries
            if (currentUserIndex < sequence.length - 1) setCurrentUserIndex((i) => i + 1)
            else setEntries([])
          } else {
            setEntries(list)
            setEntryIndex(0)
          }
        }
      } catch {
        if (!cancelled) { setEntries([]); setError("Failed to load") }
      } finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [sequence, currentUserIndex, groupId])

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
      // Move to previous user; we will reset entryIndex on load
      setCurrentUserIndex((i) => Math.max(0, i - 1))
    } else {
      router.back()
    }
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
    <View style={{ width, height, backgroundColor: '#000' }}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={styles.header}>
        <Image source={{ uri: item?.user?.profilePic || "https://i.pravatar.cc/100?img=12" }} style={styles.avatar} />
        <View style={{ marginLeft: 10 }}>
          <Text style={styles.name}>{item?.user?.name || "User"}</Text>
          <Text style={styles.time}>{new Date(item?.createdAt).toLocaleTimeString()}</Text>
        </View>
      </View>
      <View style={styles.body}>
        {item?.mediaUrl ? (
          <Image source={{ uri: item.mediaUrl }} style={styles.media} resizeMode="contain" />
        ) : (
          <View style={{ paddingHorizontal: 20 }}>
            <Text style={styles.textContent}>{item?.text || ""}</Text>
          </View>
        )}
      </View>
      {/* Tap zones */}
      <TouchableOpacity style={styles.leftZone} onPress={goPrev} activeOpacity={0.2} />
      <TouchableOpacity style={styles.rightZone} onPress={goNext} activeOpacity={0.2} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", alignItems: 'center', justifyContent: 'center' },
  topBar: { position: "absolute", top: 50, right: 16, zIndex: 10 },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 50, paddingHorizontal: 16 },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  name: { color: "#fff", fontWeight: "700" },
  time: { color: "#ccc", fontSize: 12 },
  body: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },
  media: { width: "100%", height: "80%" },
  textContent: { color: "#fff", fontSize: 20, textAlign: "center" },
  leftZone: { position: 'absolute', left: 0, top: 0, bottom: 0, width: width * 0.35 },
  rightZone: { position: 'absolute', right: 0, top: 0, bottom: 0, width: width * 0.65 },
})

