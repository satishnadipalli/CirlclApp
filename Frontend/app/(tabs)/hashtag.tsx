import { useLocalSearchParams, useRouter } from "expo-router"
import React, { useEffect, useState } from "react"
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import api from "@/services/api.service"

export default function HashtagScreen() {
  const { tag } = useLocalSearchParams<{ tag?: string }>()
  const [posts, setPosts] = useState<any[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const load = async (p = 1, replace = false) => {
    if (loading && !replace) return
    setLoading(true)
    try {
      const res: any = await api.getHashtagFeed(String(tag || ''), p, 18)
      const items: any[] = Array.isArray(res?.posts) ? res.posts : []
      setPosts((prev) => (replace ? items : p === 1 ? items : [...prev, ...items]))
      const totalPages = Number(res?.totalPages || 1)
      setHasMore(p < totalPages)
      setPage(p)
    } catch {
      if (replace) setPosts([])
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(1, true) }, [tag])

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ padding: 16, borderBottomWidth: 0.5, borderBottomColor: '#ddd' }}>
        <Text style={{ fontSize: 20, fontWeight: '800' }}>#{String(tag || '')}</Text>
      </View>
      <FlatList
        data={posts}
        keyExtractor={(item) => String(item?._id || Math.random())}
        numColumns={3}
        columnWrapperStyle={{ gap: 2 }}
        contentContainerStyle={{ padding: 2, gap: 2 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={{ width: '33.333%', aspectRatio: 1 }} onPress={() => router.push(`/post/${item._id}`)}>
            <Image source={{ uri: item?.mediaUrl || 'https://i.pravatar.cc/500?img=24' }} style={{ width: '100%', height: '100%' }} />
          </TouchableOpacity>
        )}
        onEndReached={() => { if (hasMore && !loading) load(page + 1) }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={loading ? (<View style={{ padding: 12, alignItems: 'center' }}><Text>Loading…</Text></View>) : null}
      />
    </View>
  )
}

const styles = StyleSheet.create({})