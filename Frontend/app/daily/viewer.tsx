import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import api from "@/services/api.service"

export default function DailyViewer() {
  const { userId } = useLocalSearchParams<{ userId: string }>()
  const router = useRouter()
  const [entry, setEntry] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getDailyEntryByUser(String(userId))
        if (res?.success) setEntry((res as any).entry)
        else setError((res as any)?.message || "Locked")
      } catch (e) {
        setError("Failed to load")
      } finally {
        setLoading(false)
      }
    })()
  }, [userId])

  if (loading) return (
    <View style={styles.container}><ActivityIndicator /></View>
  )

  if (!entry) return (
    <View style={styles.container}>
      <Text style={{ color: "#fff" }}>{error || "No entry"}</Text>
      <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}><Text style={{ color: "#fff" }}>Close</Text></TouchableOpacity>
    </View>
  )

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.topBar} onPress={() => router.back()}>
        <Ionicons name="close" size={24} color="#fff" />
      </TouchableOpacity>
      <View style={styles.header}>
        <Image source={{ uri: entry?.user?.profilePic || "https://i.pravatar.cc/100?img=12" }} style={styles.avatar} />
        <View style={{ marginLeft: 10 }}>
          <Text style={styles.name}>{entry?.user?.name || "User"}</Text>
          <Text style={styles.time}>{new Date(entry?.createdAt).toLocaleTimeString()}</Text>
        </View>
      </View>
      <View style={styles.body}>
        {entry?.mediaUrl ? (
          <Image source={{ uri: entry.mediaUrl }} style={styles.media} resizeMode="contain" />
        ) : (
          <Text style={styles.textContent}>{entry?.text || ""}</Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  topBar: { position: "absolute", top: 50, right: 16, zIndex: 10 },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 50, paddingHorizontal: 16 },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  name: { color: "#fff", fontWeight: "700" },
  time: { color: "#ccc", fontSize: 12 },
  body: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },
  media: { width: "100%", height: "80%" },
  textContent: { color: "#fff", fontSize: 20, textAlign: "center" },
})

