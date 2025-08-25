import React, { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { FlatList, Image, Text, TouchableOpacity, View } from 'react-native'
import api from '@/services/api.service'
import AsyncStorage from '@react-native-async-storage/async-storage'

export default function PlaceScreen() {
  const { name } = useLocalSearchParams<{ name?: string }>()
  const [posts, setPosts] = useState<any[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [useNearby, setUseNearby] = useState(false)
  const router = useRouter()

  const load = async (p = 1, replace = false) => {
    if (loading && !replace) return
    setLoading(true)
    try {
      let res: any
      if (useNearby) {
        const coordsRaw = await AsyncStorage.getItem('user_coords')
        const coords = coordsRaw ? JSON.parse(coordsRaw) : null
        if (!coords) { setLoading(false); return }
        res = await api.getNearbyFeed(coords.lat, coords.lng, 50, p, 18)
        const items: any[] = Array.isArray(res?.posts) ? res.posts : []
        setPosts((prev) => (replace ? items : p === 1 ? items : [...prev, ...items]))
        setHasMore(items.length === 18)
      } else {
        res = await api.getPlaceFeed(String(name || ''), p, 18)
        const items: any[] = Array.isArray(res?.posts) ? res.posts : []
        setPosts((prev) => (replace ? items : p === 1 ? items : [...prev, ...items]))
        const totalPages = Number(res?.totalPages || 1)
        setHasMore(p < totalPages)
      }
      setPage(p)
    } catch {
      if (replace) setPosts([])
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(1, true) }, [name, useNearby])

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ padding: 16, borderBottomWidth: 0.5, borderBottomColor: '#ddd', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 20, fontWeight: '800' }}>{useNearby ? 'Nearby' : String(name || 'Place')}</Text>
        <TouchableOpacity onPress={() => setUseNearby((v) => !v)}>
          <Text style={{ color: '#007AFF', fontWeight: '700' }}>{useNearby ? 'By Name' : 'Nearby'}</Text>
        </TouchableOpacity>
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