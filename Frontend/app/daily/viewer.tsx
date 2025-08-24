import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View, Dimensions, PanResponder, TextInput, Alert, ScrollView } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { Video } from "expo-av"
import api from "@/services/api.service"
import AsyncStorage from "@react-native-async-storage/async-storage"
import socketService from "@/services/socket.service"

const { width, height } = Dimensions.get('window')

// Offline queue keys
const OFFLINE_QUEUE_KEY = 'daily_offline_queue_v1'

async function enqueueOffline(action: any) {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    arr.push({ ...action, at: Date.now() })
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(arr))
  } catch {}
}

async function flushOffline(api: any) {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY)
    const arr: any[] = raw ? JSON.parse(raw) : []
    if (!Array.isArray(arr) || arr.length === 0) return
    const remain: any[] = []
    for (const item of arr) {
      try {
        if (item.type === 'react') await api.dailyReact(item.entryId, item.value)
        else if (item.type === 'highlight') await api.dailyHighlight(item.entryId, item.on)
      } catch {
        remain.push(item)
      }
    }
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remain))
  } catch {}
}

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
  const [myId, setMyId] = useState<string | null>(null)
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set())
  const [reactionState, setReactionState] = useState<Record<string, { counts: Record<string, number>; my: string | null }>>({})
  const timerRef = useRef<any>(null)
  const [showReactors, setShowReactors] = useState(false)
  const [reactors, setReactors] = useState<any[]>([])
  const [reactorFilter, setReactorFilter] = useState<string | undefined>(undefined)
  const [reactorsLoading, setReactorsLoading] = useState(false)
  const [showReport, setShowReport] = useState(false)

  const [groupRings, setGroupRings] = useState<Array<{ _id: string; name: string; profilePic?: string; index: number }>>([])
  const [promptText, setPromptText] = useState<string | null>(null)
  const [typingUsers, setTypingUsers] = useState<Array<{ from: string; name?: string }>>([])

  const defaultSegMs = Math.max(1000, Math.min(45000, Number.parseInt(String(dur || "")) || 5000))
  const segMsRef = useRef<number>(defaultSegMs)
  const videoRef = useRef<Video | null>(null)

  const isVideoUrl = (u?: string) => !!u && /\.(mp4|mov|m4v|webm)$/i.test(u)

  // Load my user id and highlights
  useEffect(() => {
    ;(async () => {
      try {
        const raw = await AsyncStorage.getItem("user")
        if (raw) {
          const parsed = JSON.parse(raw)
          setMyId(parsed?.id || null)
        }
      } catch {}
    })()
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const res: any = await api.getDailyHighlights()
        const ids = new Set<string>((Array.isArray(res?.entries) ? res.entries : []).map((e: any) => String(e._id)))
        setHighlightIds(ids)
      } catch {}
    })()
  }, [])

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
        // Build rings from latest entries per user
        const seen = new Set<string>()
        const rings: Array<{ _id: string; name: string; profilePic?: string; index: number }> = []
        for (let i = 0; i < list.length; i++) {
          const u = list[i]?.user
          const uid = String(u?._id || '')
          if (uid && !seen.has(uid)) {
            seen.add(uid)
            rings.push({ _id: uid, name: u?.name || 'User', profilePic: u?.profilePic || '', index: i })
          }
        }
        setGroupRings(rings)
        // Fetch today's prompt (theme)
        try {
          const pr: any = await api.getDailyPrompt()
          if ((pr as any)?.prompt?.text) setPromptText((pr as any).prompt.text)
        } catch {}
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

  // Prefetch next media (image) and opportunistically flush offline queue
  useEffect(() => {
    const next = entries[entryIndex + 1]
    if (next?.mediaUrl) Image.prefetch(next.mediaUrl)
    ;(async () => { try { await flushOffline(api) } catch {} })()
  }, [entryIndex, entries])

  // Track view on entry change and update viewsCount
  useEffect(() => {
    const entry = entries[entryIndex]
    if (!entry?._id) return
    ;(async () => {
      try {
        const res: any = await api.dailyView(String(entry._id))
        const newCount = typeof res?.viewsCount === 'number' ? res.viewsCount : undefined
        if (typeof newCount === 'number') {
          setEntries((prev) => {
            const next = prev.slice()
            const idx = entryIndex
            if (next[idx] && String(next[idx]._id) === String(entry._id)) {
              next[idx] = { ...next[idx], viewsCount: newCount }
            }
            return next
          })
        }
      } catch {}
    })()
  }, [entryIndex, entries])

  // Build reaction state from entries
  useEffect(() => {
    if (!entries || entries.length === 0) { setReactionState({}); return }
    const next: Record<string, { counts: Record<string, number>; my: string | null }> = {}
    for (const e of entries) {
      const counts: Record<string, number> = {}
      const arr = Array.isArray(e.reactions) ? e.reactions : []
      for (const r of arr) {
        if (!r?.type) continue
        counts[r.type] = (counts[r.type] || 0) + 1
      }
      let my: string | null = null
      if (myId) {
        for (const r of arr) {
          const uid = String((r as any)?.user?._id || (r as any)?.user || "")
          if (uid === String(myId)) { my = (r as any)?.type || null; break }
        }
      }
      next[String(e._id)] = { counts, my }
    }
    setReactionState(next)
  }, [entries, myId])

  // Progress timer (images/text only). Videos drive progress via playback status for smoothness.
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
    const cur = entries[entryIndex]
    const isVid = !!cur?.mediaUrl && isVideoUrl(cur.mediaUrl)
    if (!isVid) startTimer(); else clearTimer()
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

  const onReactPress = async (emoji: string) => {
    const item = entries[entryIndex]
    if (!item?._id) return
    const eid = String(item._id)
    const current = reactionState[eid]?.my || null
    const nextType = current === emoji ? null : emoji
    try {
      const res: any = await api.dailyReact(eid, nextType)
      if (res?.success) {
        setReactionState((prev) => ({ ...prev, [eid]: { counts: (res as any)?.counts || {}, my: (res as any)?.myReaction ?? null } }))
      }
    } catch {
      await enqueueOffline({ type: 'react', entryId: eid, value: nextType })
    }
  }

  const [showReactors, setShowReactors] = useState(false)
  const [reactors, setReactors] = useState<any[]>([])
  const [reactorFilter, setReactorFilter] = useState<string | undefined>(undefined)
  const [reactorsLoading, setReactorsLoading] = useState(false)
  const loadReactors = async (type?: string) => {
    try {
      const item = entries[entryIndex]
      if (!item?._id) return
      setReactorsLoading(true)
      const res: any = await api.getDailyReactors(String(item._id), type)
      const list = Array.isArray(res?.reactors) ? res.reactors : []
      setReactors(list)
    } finally { setReactorsLoading(false) }
  }

  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerTimeoutRef = useRef<any>(null)
  const openDrawer = () => {
    if (drawerTimeoutRef.current) { clearTimeout(drawerTimeoutRef.current); drawerTimeoutRef.current = null }
    setDrawerOpen(true)
  }
  const closeDrawerSoon = () => {
    if (drawerTimeoutRef.current) clearTimeout(drawerTimeoutRef.current)
    drawerTimeoutRef.current = setTimeout(() => setDrawerOpen(false), 1800)
  }

  // Captions
  const [captions, setCaptions] = useState<Array<{ start: number; end: number; text: string }>>([])
  const [showCC, setShowCC] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [showReport, setShowReport] = useState(false)
  const [reportReason, setReportReason] = useState<'spam'|'abuse'|'nudity'|'violence'|'other'>('spam')
  const submitReport = async () => {
    try {
      const entry = entries[entryIndex]
      if (!entry?._id) return
      await api.report('entry', String(entry._id), reportReason, '')
      setShowReport(false)
    } catch {}
  }
  useEffect(() => {
    (async () => {
      try {
        const entry = entries[entryIndex]
        if (!entry?._id) { setCaptions([]); return }
        const res: any = await api.getDailyCaptions(String(entry._id))
        const arr = Array.isArray(res?.captions) ? res.captions : []
        setCaptions(arr)
      } catch { setCaptions([]) }
    })()
  }, [entryIndex, entries])

  const onPlaybackStatusUpdate = (s: any) => {
    if (typeof s?.positionMillis === 'number') {
      setCurrentTime(s.positionMillis / 1000)
      if (typeof s?.durationMillis === 'number' && s.durationMillis > 0) {
        setProgress((prev) => {
          const next = prev.slice()
          next[entryIndex] = Math.max(0, Math.min(1, (s.positionMillis as number) / (s.durationMillis as number)))
          for (let i = 0; i < entryIndex; i++) next[i] = 1
          for (let i = entryIndex + 1; i < next.length; i++) next[i] = Math.min(next[i] || 0, 0)
          return next
        })
      }
    }
    if (s?.didJustFinish) { clearTimer(); goNext() }
  }

  useEffect(() => {
    if (!groupId) return
    ;(async () => {
      try {
        // Join rooms for friends with entries if needed later
        // socketService.joinGroup(String(groupId))
        const handler = (data: any) => {
          if (String(data?.groupId || '') !== String(groupId)) return
          setTypingUsers((prev) => {
            const exists = prev.some((t) => String(t.from) === String(data.from))
            if (exists) return prev
            return [...prev, { from: String(data.from), name: data?.name }]
          })
        }
        const stopHandler = (data: any) => {
          if (String(data?.groupId || '') !== String(groupId)) return
          setTypingUsers((prev) => prev.filter((t) => String(t.from) !== String(data.from)))
        }
        socketService.onGroupTyping(handler)
        socketService.onGroupStopTyping(stopHandler)
        return () => {
          socketService.removeTypingListener(handler as any)
          socketService.removeStopTypingListener(stopHandler as any)
          socketService.leaveGroup(String(groupId))
        }
      } catch {}
    })()
  }, [groupId])

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

      {groupId && groupRings.length > 0 && (
        <View style={{ paddingHorizontal: 12, paddingTop: 8, flexDirection: 'row', alignItems: 'center' }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {groupRings.map((r) => {
                const active = String(item?.user?._id || '') === r._id
                return (
                  <TouchableOpacity key={r._id} onPress={() => setEntryIndex(r.index)}>
                    <Image
                      source={{ uri: r.profilePic || 'https://i.pravatar.cc/100?img=12' }}
                      style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: active ? '#fff' : 'rgba(255,255,255,0.4)' }}
                    />
                  </TouchableOpacity>
                )
              })}
            </View>
          </ScrollView>
          {promptText ? (
            <View style={{ marginLeft: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, maxWidth: width * 0.5 }}>
              <Text style={{ color: '#fff', fontSize: 12 }} numberOfLines={1}>Theme: {promptText}</Text>
            </View>
          ) : null}
        </View>
      )}

      <View style={styles.header}>
        <Image source={{ uri: item?.user?.profilePic || "https://i.pravatar.cc/100?img=12" }} style={styles.avatar} />
        <View style={{ marginLeft: 10 }}>
          <Text style={styles.name}>{item?.user?.name || "User"}</Text>
          <Text style={styles.time}>{new Date(item?.createdAt).toLocaleTimeString()}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ color: '#fff', fontSize: 12 }}>{typeof item?.viewsCount === 'number' ? `${item.viewsCount} views` : ''}</Text>
          <TouchableOpacity onPress={async () => {
            try {
              const eid = String(item._id)
              const isOn = highlightIds.has(eid)
              await api.dailyHighlight(eid, !isOn)
              setHighlightIds((prev) => {
                const next = new Set(prev)
                if (isOn) next.delete(eid); else next.add(eid)
                return next
              })
            } catch {
              const eid = String(item._id)
              const isOn = highlightIds.has(eid)
              await enqueueOffline({ type: 'highlight', entryId: eid, on: !isOn })
              setHighlightIds((prev) => {
                const next = new Set(prev)
                if (isOn) next.delete(eid); else next.add(eid)
                return next
              })
            }
          }}>
            <Ionicons name={highlightIds.has(String(item._id)) ? "bookmark" : "bookmark-outline"} size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={async () => {
            try {
              const uid = String(item?.user?._id || '')
              if (!uid) return
              await api.blockUser(uid)
            } catch {}
          }}>
            <Ionicons name="alert-circle-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowReport(true)}>
            <Ionicons name="flag-outline" size={20} color="#fff" />
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
            onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          />
        ) : item?.mediaUrl ? (
          <Image source={{ uri: item.mediaUrl }} style={styles.media} resizeMode="contain" />
        ) : (
          <View style={{ paddingHorizontal: 20 }}>
            <Text style={styles.textContent}>{item?.text || ""}</Text>
          </View>
        )}
        {/* CC overlay */}
        {showCC && captions.length > 0 && (
          <View style={{ position: 'absolute', left: 12, right: 12, bottom: 120, alignItems: 'center' }}>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
              <Text style={{ color: '#fff', textAlign: 'center' }}>
                {(() => {
                  const seg = captions.find((c) => currentTime >= (c.start || 0) && currentTime <= (c.end || 0))
                  return seg?.text || ''
                })()}
              </Text>
            </View>
          </View>
        )}
        {groupId && typingUsers.length > 0 && (
          <View style={{ position: 'absolute', left: 12, right: 12, bottom: 160, alignItems: 'center' }}>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: '#fff', fontSize: 12 }}>{typingUsers.slice(0, 3).map((t) => t.name || 'Someone').join(', ')} typing…</Text>
            </View>
          </View>
        )}
      </View>
      {/* Tap/press zones: pause on press-in, resume on press-out; disabled when modals open */}
      {!(showReactors || showReport) && (
        <>
          <TouchableOpacity style={styles.leftZone} onPress={goPrev} onPressIn={() => setPaused(true)} onPressOut={() => setPaused(false)} activeOpacity={0.2} />
          <TouchableOpacity style={styles.rightZone} onPress={goNext} onPressIn={() => setPaused(true)} onPressOut={() => setPaused(false)} activeOpacity={0.2} />
        </>
      )}

      {/* Controls: CC, Reactions, People; owner tools on second row */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 86, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity onPress={() => setShowCC((v) => !v)}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>{showCC ? 'CC On' : 'CC Off'}</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            {['❤️','😂','🔥','😮','👏'].map((emoji) => {
              const eid = String(item?._id || "")
              const state = reactionState[eid] || { counts: {}, my: null }
              const count = (state.counts && state.counts[emoji]) ? state.counts[emoji] : 0
              const selected = state.my === emoji
              return (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => onReactPress(emoji)}
                  onLongPress={() => { openDrawer() }}
                  style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: selected ? 28 : 24, opacity: selected ? 1 : 0.85 }}>{emoji}</Text>
                  {count > 0 && <Text style={{ color: '#fff', fontSize: 12, marginTop: 2 }}>{count}</Text>}
                </TouchableOpacity>
              )
            })}
          </View>
          <TouchableOpacity onPress={async () => { await loadReactors(); setReactorFilter(undefined); setShowReactors(true) }}>
            <Ionicons name="people-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        {drawerOpen && (
          <View style={{ marginTop: 10, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {['👍','🎉','😍','😢','😡','🙏','✨','🤩'].map((e) => (
                <TouchableOpacity key={e} onPress={() => { onReactPress(e); closeDrawerSoon() }}>
                  <Text style={{ fontSize: 20 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        {String(item?.user?._id || '') === String(myId || '') && (
          <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 14 }}>
            <TouchableOpacity
              onPress={async () => {
                try {
                  const eid = String(item._id)
                  const r: any = await api.autoDailyCaptions(eid)
                  if (r?.success && Array.isArray(r.captions)) setCaptions(r.captions)
                } catch {}
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Auto CC</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                try {
                  const ok = await new Promise<boolean>((resolve) => {
                    (Alert as any)?.alert?.('Delete', 'Delete this entry?', [
                      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
                    ])
                  })
                  if (!ok) return
                  const eid = String(item._id)
                  const resp: any = await (api as any).request(`/daily/${eid}`, { method: 'DELETE' })
                  if (resp && resp.success !== false) {
                    setEntries((prev) => prev.filter((e) => String(e._id) !== eid))
                    setEntryIndex((i) => Math.max(0, i - 1))
                  }
                } catch {}
              }}
            >
              <Text style={{ color: '#f55', fontWeight: '800' }}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
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

      {/* Simple captions editor for owner */}
      {String(item?.user?._id || '') === String(myId || '') && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 130, alignItems: 'center' }}>
          <TouchableOpacity onPress={() => setShowCC(true)} style={{ backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>Show CC</Text>
          </TouchableOpacity>
          {showCC && captions.length > 0 && (
            <View style={{ marginTop: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, padding: 10, width: '94%' }}>
              {captions.slice(0, 5).map((c, idx) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Text style={{ color: '#aaa', width: 64 }}>{c.start.toFixed(1)}–{c.end.toFixed(1)}</Text>
                  <TextInput
                    style={{ flex: 1, color: '#fff', borderBottomWidth: 1, borderBottomColor: '#333', paddingVertical: 4 }}
                    value={c.text}
                    onChangeText={(t) => {
                      setCaptions((prev) => {
                        const next = prev.slice()
                        next[idx] = { ...next[idx], text: t }
                        return next
                      })
                    }}
                  />
                </View>
              ))}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                <TouchableOpacity onPress={async () => { try { const eid = String(item._id); const r: any = await api.putDailyCaptions(eid, captions); if (r?.success) {} } catch {} }}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Reactors modal */}
      {showReactors && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowReactors(false)} />
          <View style={{ backgroundColor: '#111', padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: height * 0.5 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Reactors</Text>
              <TouchableOpacity onPress={() => setShowReactors(false)}><Ionicons name="close" size={22} color="#fff" /></TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {['All','❤️','😂','🔥','😮','👏'].map((label) => (
                <TouchableOpacity
                  key={label}
                  onPress={async () => { const t = label === 'All' ? undefined : label; setReactorFilter(t); await loadReactors(t) }}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: (reactorFilter ?? 'All') === (label === 'All' ? undefined : label) ? '#222' : '#000' }}>
                  <Text style={{ color: '#fff' }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {reactorsLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View>
                {reactors.length === 0 ? (
                  <Text style={{ color: '#999' }}>No reactions yet.</Text>
                ) : (
                  reactors.map((r, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
                      <Image source={{ uri: r?.user?.profilePic || 'https://i.pravatar.cc/100?img=8' }} style={{ width: 32, height: 32, borderRadius: 16, marginRight: 10 }} />
                      <Text style={{ color: '#fff', flex: 1 }}>{r?.user?.name || 'User'}</Text>
                      <Text style={{ fontSize: 16 }}>{r?.type || ''}</Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        </View>
      )}

      {/* Report modal */}
      {showReport && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowReport(false)} />
          <View style={{ backgroundColor: '#111', padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
            <Text style={{ color: '#fff', fontWeight: '800', marginBottom: 10 }}>Report</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(['spam','abuse','nudity','violence','other'] as const).map((r) => (
                <TouchableOpacity key={r} onPress={() => setReportReason(r)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: reportReason === r ? '#222' : '#000' }}>
                  <Text style={{ color: '#fff' }}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              <TouchableOpacity onPress={() => setShowReport(false)}><Text style={{ color: '#aaa' }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={submitReport}><Text style={{ color: '#fff', fontWeight: '800' }}>Submit</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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

