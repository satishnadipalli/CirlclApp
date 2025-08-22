import React, { useEffect, useState } from "react"
import { ActivityIndicator, FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { useRouter } from "expo-router"
import api from "@/services/api.service"

export default function HighlightsScreen() {
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const router = useRouter()

  const load = async () => {
    try {
      const res: any = await api.getDailyHighlights()
      const list = Array.isArray(res?.entries) ? res.entries : []
      setEntries(list)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openEntry = (entry: any) => {
    const uid = entry?.user?._id
    if (!uid) return
    router.push({ pathname: "/daily/viewer", params: { userId: String(uid) } })
  }

  const removeHighlight = async (entryId: string) => {
    try {
      await api.dailyHighlight(String(entryId), false)
      setEntries((prev) => prev.filter((e) => String(e._id) !== String(entryId)))
    } catch {}
  }

  if (loading) return (
    <View style={styles.center}><ActivityIndicator /></View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#eee", flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 20, fontWeight: '800' }}>Highlights</Text>
        <TouchableOpacity onPress={() => load()} style={{ backgroundColor: '#f2f2f2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 }}>
          <Text style={{ fontWeight: '700' }}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {entries.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ color: '#666' }}>No highlights yet.</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => String(item._id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} />}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <View style={{ marginBottom: 14, borderWidth: 1, borderColor: '#eee', borderRadius: 12, overflow: 'hidden' }}>
              <TouchableOpacity onPress={() => openEntry(item)}>
                {item?.mediaUrl ? (
                  <Image source={{ uri: item.mediaUrl }} style={{ width: '100%', height: 220, backgroundColor: '#eee' }} resizeMode="cover" />
                ) : (
                  <View style={{ height: 160, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fafafa' }}>
                    <Text style={{ color: '#333', paddingHorizontal: 12, textAlign: 'center' }}>{item?.text || 'Text highlight'}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={{ paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontWeight: '700', flex: 1 }}>{item?.user?.name || 'User'}</Text>
                <TouchableOpacity onPress={() => removeHighlight(item._id)} style={{ backgroundColor: '#f2f2f2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                  <Text style={{ fontWeight: '700' }}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})