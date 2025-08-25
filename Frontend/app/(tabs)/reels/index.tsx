"use client"

import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Dimensions, FlatList, Image, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native'
import { Modal, TextInput, KeyboardAvoidingView, Platform, Share, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { Video } from 'expo-av'
import { Ionicons } from '@expo/vector-icons'
import api from '@/services/api.service'
import * as Haptics from 'expo-haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'

const { height, width } = Dimensions.get('window')

export default function ReelsScreen() {
  const router = useRouter()
  const [reels, setReels] = useState<any[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isMuted, setIsMuted] = useState<boolean>(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [dailyPosted, setDailyPosted] = useState<boolean>(false)
  const [commentsOpenForId, setCommentsOpenForId] = useState<string | null>(null)
  const [commentsPost, setCommentsPost] = useState<any | null>(null)
  const [commentsLoading, setCommentsLoading] = useState<boolean>(false)
  const [commentText, setCommentText] = useState<string>('')
  const savedLocalRef = useRef<Record<string, boolean>>({})

  const videoRefs = useRef<Map<string, Video>>(new Map())
  const likeLocalRef = useRef<Record<string, boolean>>({})
  const likeCountLocalRef = useRef<Record<string, number>>({})
  const progressRef = useRef<Record<string, number>>({}) // 0..1
  const impressionSentRef = useRef<Record<string, boolean>>({})
  const [isPaused, setIsPaused] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [showMuteHint, setShowMuteHint] = useState(false)

  const isCloudinaryUrl = (u: string) => /res\.cloudinary\.com\//.test(u) && /\/video\/upload\//.test(u)
  const stripQuery = (u: string) => u.split('?')[0]
  const deriveHlsUrl = (u: string) => {
    try {
      const base = stripQuery(u)
      if (!isCloudinaryUrl(base)) return null
      const parts = base.split('/video/upload/')
      if (parts.length !== 2) return null
      const prefix = parts[0]
      const rest = parts[1]
      const withoutExt = rest.replace(/\.[a-z0-9]+$/i, '')
      return `${prefix}/video/upload/sp_auto/${withoutExt}/manifest.m3u8`
    } catch { return null }
  }
  const derivePosterUrl = (u: string, fallback?: string) => {
    try {
      const base = stripQuery(u)
      if (!isCloudinaryUrl(base)) return fallback || ''
      const parts = base.split('/video/upload/')
      if (parts.length !== 2) return fallback || ''
      const prefix = parts[0]
      const rest = parts[1]
      const withoutExt = rest.replace(/\.[a-z0-9]+$/i, '')
      return `${prefix}/video/upload/so_1/${withoutExt}.jpg`
    } catch { return fallback || '' }
  }
  const getPlayback = (mediaUrl?: string, fallbackPoster?: string) => {
    const raw = String(mediaUrl || '')
    const isHls = /\.m3u8$/i.test(raw)
    const hls = isHls ? raw : deriveHlsUrl(raw)
    const poster = derivePosterUrl(raw, fallbackPoster)
    return { sourceUrl: hls || raw, posterUrl: poster }
  }

  // Heart animation for double-tap
  const heartScale = useRef(new Animated.Value(0)).current
  const [heartKey, setHeartKey] = useState<string | null>(null)
  const lastTapRef = useRef<number>(0)

  // Metrics state
  const startedRef = useRef<Record<string, boolean>>({})
  const lastReportedMsRef = useRef<Record<string, number>>({})
  const lastSentAtRef = useRef<Record<string, number>>({})
  const inFlightRef = useRef<Record<string, boolean>>({})

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
      try {
        const p: any = await (api as any).getDailyPrompt()
        setDailyPosted(!!p?.posted)
      } catch {}
    })()
  }, [])

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (!Array.isArray(viewableItems) || viewableItems.length === 0) return
    // Require higher threshold (>=90%) before switching to reduce flicker
    const first = viewableItems.find((v: any) => (v?.isViewable && (v?.index ?? 0) >= 0 && (v?.item)))
    const idx = first?.index ?? (viewableItems[0].index ?? 0)
    setCurrentIndex(idx)
  }).current

  // Play/pause current, preload neighbor posters, send impression metric
  useEffect(() => {
    const current = reels[currentIndex]
    // show mute hint briefly when switching if muted
    if (isMuted) {
      setShowMuteHint(true)
      setTimeout(() => setShowMuteHint(false), 1200)
    } else {
      setShowMuteHint(false)
    }
    reels.forEach((r, idx) => {
      const ref = videoRefs.current.get(String(r?._id))
      if (!ref) return
      try {
        if (idx === currentIndex && !isPaused) ref.playAsync();
        else ref.pauseAsync()
      } catch {}
    })
    const next = reels[currentIndex + 1]
    if (next?.mediaUrl) {
      const { posterUrl } = getPlayback(next.mediaUrl, next?.user?.profilePic)
      if (posterUrl) Image.prefetch(posterUrl)
    }
    if (current?._id) {
      // reset progress tracking
      lastReportedMsRef.current[String(current._id)] = 0
      startedRef.current[String(current._id)] = false
      if (!impressionSentRef.current[String(current._id)]) {
        impressionSentRef.current[String(current._id)] = true
        ;(api as any).postMetric(String(current._id), { event: 'impression' }).catch(() => {})
      }
    }
  }, [currentIndex, reels, isPaused])

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

  const onToggleSave = async (item: any) => {
    const id = String(item?._id || '')
    if (!id) return
    const current = !!savedLocalRef.current[id]
    savedLocalRef.current[id] = !current
    setReels((prev) => [...prev])
    try { await (api as any).toggleSave(id) } catch { savedLocalRef.current[id] = current; setReels((prev) => [...prev]) }
  }

  const openComments = async (item: any) => {
    const id = String(item?._id || '')
    if (!id) return
    setCommentsOpenForId(id)
    setCommentsLoading(true)
    try {
      const res: any = await (api as any).getPostById(id)
      if (res?.success) setCommentsPost(res.post)
    } catch {}
    setCommentsLoading(false)
  }

  const submitComment = async () => {
    const id = String(commentsOpenForId || '')
    if (!id || !commentText.trim()) return
    const text = commentText.trim()
    setCommentText('')
    try {
      const res: any = await (api as any).addComment(id, text)
      if (res && (res._id || res?.success)) {
        try {
          const fresh: any = await (api as any).getPostById(id)
          if (fresh?.success) setCommentsPost(fresh.post)
        } catch {}
      }
    } catch {}
  }

  const onShare = async (item: any) => {
    try {
      const url = `${require('@/constants/Config').API_BASE_URL.replace(/\/api$/, '')}/post/${String(item?._id || '')}`
      await Share.share({ message: url })
    } catch {}
  }

  const onNotInterested = async (item: any) => {
    const id = String(item?._id || '')
    if (!id) return
    try {
      await (api as any).notInterested(id)
      // Remove from list optimistically
      setReels((prev) => prev.filter((p) => String(p?._id) !== id))
    } catch {}
  }

  const onLongPress = (item: any) => {
    Alert.alert('Actions', undefined, [
      { text: 'Not Interested', onPress: () => onNotInterested(item) },
      { text: 'Copy Link', onPress: () => onShare(item) },
      { text: 'Report', onPress: () => {
        try { (api as any).report('post', String(item?._id || ''), 'spam') } catch {}
      } },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const onPressHashtag = (tag: string) => {
    try { router.push({ pathname: '/(tabs)/search', params: { hashtag: tag.replace(/^#/, '') } }) } catch {}
  }

  const creatorFollowed = (item: any): boolean => {
    const me = String(currentUserId || '')
    const authorId = String(item?.user?._id || '')
    if (!authorId || authorId === me) return true
    // naive: treat presence of followers list including me as followed if available; else false and show CTA
    return false
  }

  const onFollow = async (item: any) => {
    const uid = String(item?.user?._id || '')
    if (!uid) return
    try { await (api as any).followUser(uid) } catch {}
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
      // buffering UI
      setIsBuffering(Boolean(status?.isBuffering))
      // only track metrics for currently visible item
      const current = reels[currentIndex]
      if (!current || String(current?._id || '') !== id) return
      if (!status?.isPlaying || status?.isBuffering) return
      // progress
      if (typeof status?.positionMillis === 'number' && typeof status?.durationMillis === 'number' && status.durationMillis > 0) {
        const p = Math.max(0, Math.min(1, status.positionMillis / status.durationMillis))
        progressRef.current[id] = p
      }
      // start
      if (status?.isPlaying && status?.positionMillis > 300 && !startedRef.current[id]) {
        startedRef.current[id] = true
        const key = `${id}:watch_start`
        if (!inFlightRef.current[key]) {
          inFlightRef.current[key] = true
          ;(api as any).postMetric(id, { event: 'watch_start' }).catch(() => {}).finally(() => { inFlightRef.current[key] = false })
        }
      }
      // periodic progress every ~5s
      const last = lastReportedMsRef.current[id] || 0
      const pos = Number(status?.positionMillis || 0)
      const now = Date.now()
      const lastSentAt = lastSentAtRef.current[`${id}:progress`] || 0
      if (status?.isPlaying && pos - last >= 5000 && now - lastSentAt >= 5000) {
        lastReportedMsRef.current[id] = pos
        lastSentAtRef.current[`${id}:progress`] = now
        const key = `${id}:watch_progress`
        if (!inFlightRef.current[key]) {
          inFlightRef.current[key] = true
          ;(api as any).postMetric(id, { event: 'watch_progress', deltaMs: 5000 }).catch(() => {}).finally(() => { inFlightRef.current[key] = false })
        }
      }
      // complete + rewatch (looping)
      if (status?.didJustFinish) {
        const keyC = `${id}:watch_complete`
        const keyR = `${id}:rewatch`
        if (!inFlightRef.current[keyC]) {
          inFlightRef.current[keyC] = true
          ;(api as any).postMetric(id, { event: 'watch_complete', durationMs: Number(status?.durationMillis || 0) }).catch(() => {}).finally(() => { inFlightRef.current[keyC] = false })
        }
        if (!inFlightRef.current[keyR]) {
          inFlightRef.current[keyR] = true
          ;(api as any).postMetric(id, { event: 'rewatch' }).catch(() => {}).finally(() => { inFlightRef.current[keyR] = false })
        }
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
    const saved = !!savedLocalRef.current[String(item?._id || '')]
    const uri = String(item?.mediaUrl || '')
    const { sourceUrl, posterUrl } = getPlayback(uri, item?.user?.profilePic)
    return (
      <View style={styles.item}>
        <TouchableWithoutFeedback
          onPress={() => {
            onDoubleTap(item)
            // single tap toggles pause/play (with slight delay to avoid overriding double-tap like)
            setTimeout(async () => {
              try {
                const ref = videoRefs.current.get(String(item?._id))
                if (!ref) return
                if (isPaused) { setIsPaused(false); await ref.playAsync() } else { setIsPaused(true); await ref.pauseAsync() }
              } catch {}
            }, 160)
          }}
        >
          <View>
            <Video
              ref={(r) => { if (r) videoRefs.current.set(String(item._id), r) }}
              source={{ uri: sourceUrl }}
              style={styles.video}
              resizeMode={'cover' as any}
              shouldPlay={index === currentIndex && !isPaused}
              isLooping
              isMuted={isMuted}
              onPlaybackStatusUpdate={onStatusUpdate(item)}
              posterSource={posterUrl ? { uri: posterUrl } : undefined}
              usePoster={!!posterUrl}
            />
            {isBuffering && (
              <View style={styles.bufferOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
            {showMuteHint && isMuted && (
              <View style={styles.muteHint}>
                <Ionicons name="volume-mute-outline" size={18} color="#fff" />
                <Text style={{ color: '#fff', marginLeft: 6, fontWeight: '700' }}>Tap to unmute</Text>
              </View>
            )}
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
          {/* Daily Circle chip */}
          <View style={{ position: 'absolute', top: 44, left: 12 }}>
            <TouchableOpacity onPress={() => {
              if (dailyPosted) router.push({ pathname: '/daily/viewer', params: { userId: currentUserId || '' } })
              else router.push({ pathname: '/(tabs)/search', params: { focusDaily: '1', openComposer: '1' } })
            }} style={{ backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Daily</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }} />
          <View style={styles.meta}>
            <Image source={{ uri: item?.user?.profilePic || 'https://i.pravatar.cc/100?img=6' }} style={styles.avatar} />
            <Text style={styles.name}>{item?.user?.name || 'User'}</Text>
            {!!item?.title && (
              <Text style={styles.caption} numberOfLines={2}>
                {String(item.title || '').split(/(#[A-Za-z0-9_]+)/g).map((seg: string, i: number) => (
                  /^#[A-Za-z0-9_]+$/.test(seg)
                    ? <Text key={i} style={{ color: '#4ea1ff' }} onPress={() => onPressHashtag(seg)}>{seg}</Text>
                    : <Text key={i}>{seg}</Text>
                ))}
              </Text>
            )}
            {!creatorFollowed(item) && (
              <TouchableOpacity onPress={() => onFollow(item)} style={{ backgroundColor: '#4ea1ff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start', marginTop: 6 }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>Follow</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.action} onPress={() => { try { Haptics.selectionAsync() } catch {} ; toggleLike(item) }}>
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={28} color={liked ? '#FF3040' : '#fff'} />
            </TouchableOpacity>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{likes}</Text>
            <TouchableOpacity style={styles.action} onPress={() => openComments(item)}>
              <Ionicons name="chatbubble-outline" size={28} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.action} onPress={() => onShare(item)}>
              <Ionicons name="paper-plane-outline" size={28} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.action} onPress={() => onToggleSave(item)}>
              <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={26} color="#fff" />
            </TouchableOpacity>
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
        renderItem={(props) => (
          <TouchableWithoutFeedback onLongPress={() => onLongPress(props.item)}>
            <View>{renderItem(props)}</View>
          </TouchableWithoutFeedback>
        )}
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

      {/* Comments Modal */}
      <Modal visible={!!commentsOpenForId} animationType='slide' onRequestClose={() => setCommentsOpenForId(null)} transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ maxHeight: height * 0.7, backgroundColor: '#111', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 12 }}>
              <View style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 42, height: 5, borderRadius: 3, backgroundColor: '#444' }} />
              </View>
              <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Comments</Text>
              </View>
              <FlatList
                data={Array.isArray(commentsPost?.comments) ? commentsPost.comments : []}
                keyExtractor={(c: any) => String(c?._id || Math.random())}
                style={{ maxHeight: height * 0.5 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}
                ListEmptyComponent={!commentsLoading ? (<Text style={{ color: '#ccc', paddingHorizontal: 16, paddingVertical: 8 }}>No comments yet</Text>) : null}
                renderItem={({ item }) => (
                  <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 10 }}>
                    <Image source={{ uri: item?.profilePic || 'https://i.pravatar.cc/80?img=5' }} style={{ width: 34, height: 34, borderRadius: 17 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#fff' }}>
                        <Text style={{ fontWeight: '800' }}>{item?.name || 'User'} </Text>
                        {String(item?.text || '')}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 12 }}>
                        {!!(item?.likes?.length) && <Text style={{ color: '#aaa' }}>{item.likes.length} likes</Text>}
                        <TouchableOpacity onPress={async () => { try { await (api as any).likeComment(String(commentsOpenForId || ''), String(item?._id || '')) ; const fresh: any = await (api as any).getPostById(String(commentsOpenForId || '')); if (fresh?.success) setCommentsPost(fresh.post) } catch {} }}>
                          <Text style={{ color: '#fff' }}>Like</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setCommentText(`@${String(item?.name || '').split(' ')[0]} `)}>
                          <Text style={{ color: '#fff' }}>Reply</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, gap: 8 }}>
                <TextInput
                  placeholder='Add a comment...'
                  placeholderTextColor={'#888'}
                  style={{ flex: 1, backgroundColor: '#1a1a1a', color: '#fff', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 }}
                  value={commentText}
                  onChangeText={setCommentText}
                />
                <TouchableOpacity onPress={submitComment} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Text style={{ color: '#4ea1ff', fontWeight: '800' }}>Send</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setCommentsOpenForId(null)} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  item: { width, height, backgroundColor: '#000' },
  video: { width, height },
  bufferOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  muteHint: { position: 'absolute', left: 12, top: 12, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, flexDirection: 'row', alignItems: 'center' },
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