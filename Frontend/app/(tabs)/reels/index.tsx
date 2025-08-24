"use client"

import React, { useEffect, useRef, useState } from 'react'
import { Dimensions, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Video } from 'expo-av'
import { Ionicons } from '@expo/vector-icons'
import api from '@/services/api.service'

const { height, width } = Dimensions.get('window')

export default function ReelsScreen() {
  const [reels, setReels] = useState<any[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const videoRefs = useRef<Map<string, Video>>(new Map())

  const load = async (p = 1) => {
    if (loadingMore || (!hasMore && p !== 1)) return
    setLoadingMore(true)
    try {
      const res: any = await (api as any).getReels(p, 8)
      const items = Array.isArray(res?.posts) ? res.posts : []
      setReels((prev) => (p === 1 ? items : [...prev, ...items]))
      setHasMore(!!res?.hasMore)
      setPage(p)
      // Prefetch thumbnails or media for next
      items.slice(0, 2).forEach((it: any) => { if (it?.mediaUrl && /\.jpg|\.png/.test(it.mediaUrl)) Image.prefetch(it.mediaUrl) })
    } finally { setLoadingMore(false) }
  }

  useEffect(() => { load(1) }, [])

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (!Array.isArray(viewableItems) || viewableItems.length === 0) return
    const idx = viewableItems[0].index ?? 0
    setCurrentIndex(idx)
  }).current

  useEffect(() => {
    // pause others, play current
    reels.forEach((r, idx) => {
      const ref = videoRefs.current.get(String(r._id))
      if (!ref) return
      try { if (idx === currentIndex) ref.playAsync(); else ref.pauseAsync() } catch {}
    })
    // preload next
    const next = reels[currentIndex + 1]
    if (next?.mediaUrl && /\.(jpg|png)$/i.test(next.mediaUrl)) Image.prefetch(next.mediaUrl)
  }, [currentIndex, reels])

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    return (
      <View style={styles.item}>
        <Video
          ref={(r) => { if (r) videoRefs.current.set(String(item._id), r) }}
          source={{ uri: item.mediaUrl }}
          style={styles.video}
          resizeMode={'cover' as any}
          shouldPlay={index === currentIndex}
          isLooping
          isMuted={false}
        />
        <View style={styles.overlay}>
          <View style={{ flex: 1 }} />
          <View style={styles.meta}>
            <Image source={{ uri: item?.user?.profilePic || 'https://i.pravatar.cc/100?img=6' }} style={styles.avatar} />
            <Text style={styles.name}>{item?.user?.name || 'User'}</Text>
            {!!item?.title && <Text style={styles.caption} numberOfLines={2}>{item.title}</Text>}
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.action}><Ionicons name="heart-outline" size={28} color="#fff" /></TouchableOpacity>
            <TouchableOpacity style={styles.action}><Ionicons name="chatbubble-outline" size={28} color="#fff" /></TouchableOpacity>
            <TouchableOpacity style={styles.action}><Ionicons name="paper-plane-outline" size={28} color="#fff" /></TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <FlatList
        data={reels}
        keyExtractor={(it) => String(it?._id || Math.random())}
        renderItem={renderItem}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
        onEndReached={() => load(page + 1)}
        onEndReachedThreshold={0.6}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  item: { width, height, backgroundColor: '#000' },
  video: { width, height },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, padding: 12 },
  meta: { position: 'absolute', left: 12, bottom: 60, right: 80 },
  avatar: { width: 28, height: 28, borderRadius: 14, marginBottom: 6 },
  name: { color: '#fff', fontWeight: '800' },
  caption: { color: '#fff', marginTop: 4 },
  actions: { position: 'absolute', right: 12, bottom: 60, alignItems: 'center', gap: 18 },
  action: { paddingVertical: 6 },
})