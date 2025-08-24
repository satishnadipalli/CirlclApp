"use client"

import React, { useEffect, useRef, useState } from 'react'
import { Animated, Dimensions, FlatList, Image, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native'
import { Video } from 'expo-av'
import { Ionicons } from '@expo/vector-icons'
import api from '@/services/api.service'
import * as Haptics from 'expo-haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'

const { height, width } = Dimensions.get('window')

export default function ReelsScreen() {
  const [reels, setReels] = useState<any[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isMuted, setIsMuted] = useState<boolean>(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const videoRefs = useRef<Map<string, Video>>(new Map())
  const likeLocalRef = useRef<Record<string, boolean>>({})
  const likeCountLocalRef = useRef<Record<string, number>>({})
  const progressRef = useRef<Record<string, number>>({}) // 0..1

  // Heart animation for double-tap
  const heartScale = useRef(new Animated.Value(0)).current
  const [heartKey, setHeartKey] = useState<string | null>(null)
  const lastTapRef = useRef<number>(0)

  // Metrics state
  const startedRef = useRef<Record<string, boolean>>({})
  const lastReportedMsRef = useRef<Record<string, number>>({})

  const load = async (p = 1) => {
    if (loadingMore || (!hasMore && p !== 1)) return
    setLoadingMore(true)
    try {
      const res: any = await (api as any).getReels(p, 8)
      const items = Array.isArray(res?.posts) ? res.posts : []
      setReels((prev) => (p === 1 ? items : [...prev, ...items]))
      setHasMore(!!res?.hasMore)
      setPage(p)
      // Prefetch next few media thumbs (images only)
      items.slice(0, 2).forEach((it: any) => { if (it?.mediaUrl && /\.jpg|\.png/.test(it.mediaUrl)) Image.prefetch(it.mediaUrl) })
    } finally { setLoadingMore(false) }
  }

  useEffect(() => { load(1) }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const u = await AsyncStorage.getItem('user')
        if (u) setCurrentUserId(JSON.parse(u)?.id || null)
      } catch {}
      try {
        const m = await AsyncStorage.getItem('reels_muted')
        setIsMuted(m === '1')
      } catch {}
    })()
  }, [])

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (!Array.isArray(viewableItems) || viewableItems.length === 0) return
    const idx = viewableItems[0].index ?? 0
    setCurrentIndex(idx)
  }).current

  // Play/pause current, preload neighbor, send impression metric
  useEffect(() => {
    const current = reels[currentIndex]
    reels.forEach((r, idx) => {
      const ref = videoRefs.current.get(String(r?._id))
      if (!ref) return
      try { if (idx === currentIndex) ref.playAsync(); else ref.pauseAsync() } catch {}
    })
    const next = reels[currentIndex + 1]
    if (next?.mediaUrl && /\.(jpg|png)$/i.test(next.mediaUrl)) Image.prefetch(next.mediaUrl)
    if (current?._id) {
      // reset progress tracking
      lastReportedMsRef.current[String(current._id)] = 0
      startedRef.current[String(current._id)] = false
      ;(api as any).postMetric(String(current._id), { event: 'impression' }).catch(() => {})
    }
  }, [currentIndex, reels])

  const isLiked = (item: any): boolean => {
    const id = String(item?._id || '')
    if (likeLocalRef.current[id] != null) return likeLocalRef.current[id]
    const me = String(currentUserId || '')
    return Array.isArray(item?.likes) && item.likes.some((u: any) => String(u?._id || u) === me)
  }
  const likeCount = (item: any): number => {
    const id = String(item?._id || '')
    const base = Array.isArray(item?.likes) ? item.likes.length : 0
    const adj = likeCountLocalRef.current[id]
    return adj != null ? adj : base
  }

  const animateHeart = () => {
    heartScale.setValue(0)
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.timing(heartScale, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start()
  }

  const toggleLike = async (item: any) => {
    const id = String(item?._id)
    if (!id) return
    const currentlyLiked = isLiked(item)
    const currentCount = likeCount(item)
    // optimistic update
    likeLocalRef.current[id] = !currentlyLiked
    likeCountLocalRef.current[id] = Math.max(0, currentCount + (currentlyLiked ? -1 : 1))
    setReels((prev) => [...prev])
    try {
      await (api as any).likePost(id)
    } catch {
      // revert
      likeLocalRef.current[id] = currentlyLiked
      likeCountLocalRef.current[id] = currentCount
      setReels((prev) => [...prev])
    }
  }

  const onDoubleTap = async (item: any) => {
    const now = Date.now()
    const dt = now - (lastTapRef.current || 0)
    lastTapRef.current = now
    if (dt < 300) {
      setHeartKey(String(item?._id || 'heart'))
      animateHeart()
      try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {}
      if (!isLiked(item)) toggleLike(item)
    }
  }

  const onToggleMute = async () => {
    const next = !isMuted
    setIsMuted(next)
    try { await AsyncStorage.setItem('reels_muted', next ? '1' : '0') } catch {}
  }

  const onStatusUpdate = (item: any) => (status: any) => {
    try {
      const id = String(item?._id || '')
      if (!id) return
      // progress
      if (typeof status?.positionMillis === 'number' && typeof status?.durationMillis === 'number' && status.durationMillis > 0) {
        const p = Math.max(0, Math.min(1, status.positionMillis / status.durationMillis))
        progressRef.current[id] = p
      }
      // start
      if (status?.isPlaying && status?.positionMillis > 300 && !startedRef.current[id]) {
        startedRef.current[id] = true
        ;(api as any).postMetric(id, { event: 'watch_start' }).catch(() => {})
      }
      // periodic progress every ~2s
      const last = lastReportedMsRef.current[id] || 0
      const pos = Number(status?.positionMillis || 0)
      if (pos - last >= 2000) {
        lastReportedMsRef.current[id] = pos
        ;(api as any).postMetric(id, { event: 'watch_progress', deltaMs: 2000 }).catch(() => {})
      }
      // complete + rewatch (looping)
      if (status?.didJustFinish) {
        ;(api as any).postMetric(id, { event: 'watch_complete', durationMs: Number(status?.durationMillis || 0) }).catch(() => {})
        ;(api as any).postMetric(id, { event: 'rewatch' }).catch(() => {})
        // reset for next loop
        startedRef.current[id] = false
        lastReportedMsRef.current[id] = 0
      }
    } catch {}
  }

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const liked = isLiked(item)
    const likes = likeCount(item)
    const prog = progressRef.current[String(item?._id || '')] || 0
    return (
      <View style={styles.item}>
        <TouchableWithoutFeedback onPress={() => onDoubleTap(item)}>
          <View>
            <Video
              ref={(r) => { if (r) videoRefs.current.set(String(item._id), r) }}
              source={{ uri: item.mediaUrl }}
              style={styles.video}
              resizeMode={'cover' as any}
              shouldPlay={index === currentIndex}
              isLooping
              isMuted={isMuted}
              onPlaybackStatusUpdate={onStatusUpdate(item)}
            />
            {/* Progress bar */}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(prog * 100)}%` }]} />
            </View>
            {/* Heart animation */}
            {heartKey === String(item?._id || 'heart') && (
              <Animated.View
                pointerEvents='none'
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', transform: [{ scale: heartScale.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.4] }) }], opacity: heartScale }}
              >
                <Ionicons name='heart' size={120} color='#FF3040' />
              </Animated.View>
            )}
          </View>
        </TouchableWithoutFeedback>
        <View style={styles.overlay}>
          <View style={{ flex: 1 }} />
          <View style={styles.meta}>
            <Image source={{ uri: item?.user?.profilePic || 'https://i.pravatar.cc/100?img=6' }} style={styles.avatar} />
            <Text style={styles.name}>{item?.user?.name || 'User'}</Text>
            {!!item?.title && <Text style={styles.caption} numberOfLines={2}>{item.title}</Text>}
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.action} onPress={() => { try { Haptics.selectionAsync() } catch {} ; toggleLike(item) }}>
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={28} color={liked ? '#FF3040' : '#fff'} />
            </TouchableOpacity>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{likes}</Text>
            <TouchableOpacity style={styles.action}><Ionicons name="chatbubble-outline" size={28} color="#fff" /></TouchableOpacity>
            <TouchableOpacity style={styles.action}><Ionicons name="paper-plane-outline" size={28} color="#fff" /></TouchableOpacity>
            <TouchableOpacity style={[styles.action, { marginTop: 10 }]} onPress={onToggleMute}>
              <Ionicons name={isMuted ? 'volume-mute-outline' : 'volume-high-outline'} size={24} color="#fff" />
            </TouchableOpacity>
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
        initialNumToRender={3}
        windowSize={5}
        removeClippedSubviews={false}
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
  actions: { position: 'absolute', right: 12, bottom: 60, alignItems: 'center', gap: 10 },
  action: { paddingVertical: 6, alignItems: 'center' },
  progressTrack: { position: 'absolute', left: 0, right: 0, top: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
  progressFill: { height: 2, backgroundColor: '#fff' },
})