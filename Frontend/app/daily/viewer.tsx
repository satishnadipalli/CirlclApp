import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View, Dimensions } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import api from "@/services/api.service"

const { width, height } = Dimensions.get('window')

export default function DailyViewer() {
  const { userId } = useLocalSearchParams<{ userId: string }>()
  const router = useRouter()
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getDailyEntryByUser(String(userId))
        if ((res as any)?.success && Array.isArray((res as any).entries)) setEntries((res as any).entries)
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

  if (!entries || entries.length === 0) return (
    <View style={styles.container}>
      <View style={{ paddingHorizontal: 20, alignItems: 'center' }}>
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: '700', textAlign: 'center' }}>{error || "No entry available"}</Text>
        {error?.includes('unlock') && (
          <Text style={{ color: '#ccc', marginTop: 8, textAlign: 'center' }}>Post your Daily to unlock your friends’ entries.</Text>
        )}
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}>
          <Text style={{ color: "#000", fontWeight: '700' }}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  const renderItem = ({ item }: { item: any }) => (
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
    </View>
  )

  return (
    <FlatList
      data={entries}
      keyExtractor={(it, idx) => it._id || String(idx)}
      renderItem={renderItem}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
    />
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
})

