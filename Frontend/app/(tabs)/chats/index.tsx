"use client"

import { ChatListItem } from "@/components/ChatListItem"
import { apiService } from "@/services/api.service"
import { socketService } from "@/services/socket.service"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useRouter } from "expo-router"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { Alert, FlatList, LayoutAnimation, Platform, StyleSheet, Text, TextInput, UIManager, View, TouchableOpacity, StatusBar, Image, ScrollView, Button } from "react-native"
import Skeleton from "@/components/Skeleton"
import { useTheme } from "@/contexts/ThemeContext"
import { useFocusEffect } from "@react-navigation/native"
import { Ionicons } from "@expo/vector-icons"

type AnyChat = any

export default function ChatsScreen() {
  const { colors } = useTheme()
  const [search, setSearch] = useState("")
  const [chats, setChats] = useState<AnyChat[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string>("")
  const [typingState, setTypingState] = useState<Record<string, string>>({})
  const [suggestions, setSuggestions] = useState<Array<{ user: any; mutualCount: number; mutualNames: string[] }>>([])
  const [onlineMap, setOnlineMap] = useState<Set<string>>(new Set())
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, string>>({})
  const router = useRouter()
  const blockedRef = useRef<Set<string>>(new Set())

  const directListenerRef = useRef<((msg: any) => void) | null>(null)
  const groupListenerRef = useRef<((msg: any) => void) | null>(null)
  const statusListenerRef = useRef<((data: any) => void) | null>(null)

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true)
    }
    console.log("working: ChatsScreen mounted")
  }, [])

  // Fetch once userId is available (covers first navigation into tab)
  useEffect(() => {
    if (!userId) return
    console.log("working: userId available, fetching chats for", userId)
    ;(async () => { try { const me: any = await apiService.getMe(); const ids: string[] = (me?.blockedUsers || me?.user?.blockedUsers || []) as any; blockedRef.current = new Set((ids || []).map(String)) } catch {} })()
    fetchChats()
    loadSuggestions()
    seedPresence()
  }, [userId])

  const loadUser = async () => {
    try {
      const raw = await AsyncStorage.getItem("user")
      const token = await AsyncStorage.getItem("token")
      if (!raw || !token) throw new Error("no auth")
      const parsed = JSON.parse(raw)
      setUserId(parsed.id)
      apiService.setToken(token)
      return parsed.id as string
    } catch (e) {
      Alert.alert("Login required", "Please login again")
      throw e
    }
  }

  const loadSuggestions = async () => {
    try {
      const res: any = await apiService.getSuggestions()
      const arr = Array.isArray(res?.suggestions) ? res.suggestions : []
      setSuggestions(arr)
    } catch { setSuggestions([]) }
  }

  const seedPresence = async () => {
    try {
      const res: any = await apiService.getOnlineUsers()
      const set = new Set<string>((res?.userIds || []).map(String))
      setOnlineMap(set)
      // fetch last seen for peers currently in chat list (limit 10)
      const peers = (chats || []).filter(c => c.chatType === 'direct').slice(0, 10).map(c => (c.user || c.participant)?._id).filter(Boolean)
      const entries: Record<string, string> = {}
      await Promise.all(peers.map(async (pid) => {
        const r: any = await apiService.getLastSeen(String(pid))
        if (r?.success && r?.lastActiveAt) entries[String(pid)] = r.lastActiveAt
      }))
      setLastSeenMap((prev) => ({ ...prev, ...entries }))
    } catch {}
  }

  const sortChats = (list: AnyChat[]) => {
    return [...list].sort((a, b) => {
      const aTime = a?.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0
      const bTime = b?.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0
      return bTime - aTime
    })
  }

  const normalize = (arr: AnyChat[]): AnyChat[] =>
    arr.map((c) =>
      c.chatType === "direct"
        ? { chatType: "direct", user: c.user || c.participant, lastMessage: c.lastMessage, unreadCount: c.unreadCount || 0 }
        : { chatType: "group", group: c.group, lastMessage: c.lastMessage, unreadCount: c.unreadCount || 0, lastMessageFromName: c.lastMessageFromName },
    )

  const fetchChats = async () => {
    try {
      console.log("working: fetchChats() called")
      const res = await apiService.getChats()
      if (res && (res as any).success !== false) {
        const list = normalize(Array.isArray(res?.chats) ? res.chats : [])
        // Filter out direct chats with blocked users
        const filtered = list.filter((c: any) => !(c.chatType === 'direct' && blockedRef.current.has(String((c.user || c.participant)?._id || ''))))
        setChats(sortChats(filtered))
      } else {
        setChats([])
      }
    } catch (e) {
      console.error("fetch chats error", e)
      setChats([])
    } finally {
      setLoading(false)
    }
  }

  const ensurePeer = async (peerId: string) => {
    if (!peerId) return
    try {
      const res = await apiService.getUserProfile(peerId)
      const u = (res as any)?.user || (res as any)?.data || res
      setChats((prev) => prev.map((c) => (c.chatType === "direct" && (c.user || c.participant)?._id === peerId ? { ...c, user: u } : c)))
      try { const r: any = await apiService.getLastSeen(peerId); if (r?.success && r?.lastActiveAt) setLastSeenMap((p) => ({ ...p, [peerId]: r.lastActiveAt })) } catch {}
    } catch {}
  }

  const ensureGroup = async (groupId: string) => {
    if (!groupId) return
    try {
      const res = await apiService.getGroupInfo(groupId)
      const grp = (res as any)?.group || (res as any)?.data?.group
      if (grp) setChats((prev) => prev.map((c) => (c.chatType === "group" && c.group?._id === groupId ? { ...c, group: grp } : c)))
    } catch {}
  }

  const bump = (updater: (list: AnyChat[]) => { insert?: AnyChat; idx?: number; updated?: AnyChat } | null) => {
    setChats((prev) => {
      const r = updater(prev)
      if (!r) return prev
      const next = [...prev]
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      if (r.insert) next.unshift(r.insert)
      else if (typeof r.idx === "number" && r.idx >= 0 && r.updated) {
        next.splice(r.idx, 1)
        next.unshift(r.updated)
      }
      return sortChats(next)
    })
  }

  const setupRealtime = async (uid: string) => {
    socketService.registerUser(uid)

    const onDirect = (message: any) => {
      const peerId = message.from === uid ? message.to : message.from
      bump((list) => {
        const idx = list.findIndex((c) => c.chatType === "direct" && ((c.user || c.participant)?._id === peerId))
        const createdAt = message.createdAt || new Date().toISOString()
        const fromName = message.from === uid ? "You" : (idx !== -1 ? (list[idx].user || list[idx].participant)?.name : "")
        if (idx === -1) {
          ensurePeer(peerId)
          return {
            insert: {
              chatType: "direct",
              user: { _id: peerId, name: "", profilePic: "" },
              lastMessage: { text: message.text, createdAt, from: { name: fromName }, attachments: message.attachments || [] },
              unreadCount: message.from !== uid ? 1 : 0,
            },
          }
        }
        const chat = list[idx]
        return {
          idx,
          updated: {
            ...chat,
            lastMessage: { ...(chat.lastMessage || {}), text: message.text, createdAt, from: { name: fromName }, attachments: message.attachments || [] },
            unreadCount: message.from !== uid ? (chat.unreadCount || 0) + 1 : chat.unreadCount || 0,
          },
        }
      })
    }

    const onGroup = (message: any) => {
      const gid = message.group
      bump((list) => {
        const idx = list.findIndex((c) => c.chatType === "group" && c.group?._id === gid)
        const createdAt = message.createdAt || new Date().toISOString()
        if (idx === -1) {
          ensureGroup(gid)
          return null // avoid flicker unknown group
        }
        const chat = list[idx]
        const senderId = typeof message.from === 'object' ? message.from?._id : message.from
        const senderName = senderId === uid
          ? 'You'
          : (Array.isArray(chat?.group?.members) ? (chat.group.members.find((m: any) => String(m?._id) === String(senderId))?.name || '') : '')
        return {
          idx,
          updated: {
            ...chat,
            lastMessage: { ...(chat.lastMessage || {}), text: message.text, createdAt, attachments: message.attachments || [], from: { name: senderName } },
            lastMessageFromName: senderName || chat.lastMessageFromName,
          },
        }
      })
    }

    socketService.onReceiveDirectMessage(onDirect)
    socketService.onReceiveGroupMessage(onGroup)
    directListenerRef.current = onDirect
    groupListenerRef.current = onGroup

    const onStatus = (data: { userId: string; status: 'online'|'offline'; customStatus?: { text?: string; emoji?: string } }) => {
      setOnlineMap((prev) => {
        const next = new Set(prev)
        if (data.status === 'online') next.add(String(data.userId))
        else next.delete(String(data.userId))
        return next
      })
      if (data.status === 'offline') {
        // refresh last seen for user immediately
        const peerId = String(data.userId)
        apiService.getLastSeen(peerId).then((r: any) => {
          if (r?.success && r?.lastActiveAt) setLastSeenMap((p) => ({ ...p, [peerId]: r.lastActiveAt }))
        }).catch(() => {})
      }
    }
    socketService.onUserStatusChange(onStatus)
    statusListenerRef.current = onStatus

    // typing
    socketService.onTyping((data: any) => {
      const fromId = data?.from
      if (!fromId || fromId === uid) return
      // Only show direct typing in the chat list for that peer id, not groups
      setTypingState((p) => ({ ...p, [String(fromId)]: `${data?.name || "Someone"} is typing...` }))
      setTimeout(() => setTypingState((cur) => ({ ...cur, [String(fromId)]: "" })), 1500)
    })
    socketService.onGroupTyping((data: any) => {
      const gid = String(data?.groupId || '')
      const fromId = String(data?.from || '')
      if (!gid || fromId === uid) return
      // Only show typing for that specific group id
      setTypingState((p) => ({ ...p, [gid]: `${data?.name || "Someone"} is typing...` }))
      setTimeout(() => setTypingState((cur) => ({ ...cur, [gid]: "" })), 1500)
    })

    // pins update
    socketService.onMessageEdited?.((payload: any) => { /* no-op to satisfy TS */ })
  }

  useEffect(() => {
    (async () => {
      try {
        const uid = await loadUser()
        await fetchChats()
        await setupRealtime(uid)
      } catch {
        setLoading(false)
      }
    })()
    return () => {
      if (directListenerRef.current) socketService.removeDirectMessageListener(directListenerRef.current)
      if (groupListenerRef.current) socketService.removeGroupMessageListener(groupListenerRef.current)
      if (statusListenerRef.current) socketService.removeUserStatusListener(statusListenerRef.current)
      // socketService.disconnect() // Do not disconnect global socket here; managed in Root layout
    }
  }, [])

  // Periodically refresh last-seen for top direct chats
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const directs = (chats || []).filter(c => c.chatType === 'direct').slice(0, 10)
        const entries: Record<string, string> = {}
        await Promise.all(directs.map(async (c: any) => {
          const pid = String((c.user || c.participant)?._id || '')
          if (!pid) return
          try {
            const r: any = await apiService.getLastSeen(pid)
            if (r?.success && r?.lastActiveAt) entries[pid] = r.lastActiveAt
          } catch {}
        }))
        if (Object.keys(entries).length > 0) setLastSeenMap((prev) => ({ ...prev, ...entries }))
      } catch {}
    }, 60 * 1000)
    return () => clearInterval(interval)
  }, [chats])

  useFocusEffect(
    useCallback(() => {
      fetchChats() // fetch once on focus; rely on socket realtime updates afterward
      seedPresence() // refresh presence seed on focus to keep badges accurate
      return () => {}
    }, [userId]),
  )

  const filtered = chats.filter((c) => {
    const q = search.toLowerCase()
    if (c.chatType === "direct") return (c.user || c.participant)?.name?.toLowerCase().includes(q)
    return c.group?.name?.toLowerCase().includes(q)
  })

  const renderItem = ({ item }: { item: AnyChat }) => {
    const typingText = item.chatType === "direct" ? typingState[(item.user || item.participant)?._id] : typingState[item.group?._id]
    const peerId = item.chatType === 'direct' ? String((item.user || item.participant)?._id || '') : ''
    const isOnline = peerId ? onlineMap.has(peerId) : false
    const lastSeen = peerId ? lastSeenMap[peerId] : undefined
    return <ChatListItem chat={{ ...item, __presence: { isOnline, lastSeen } }} currentUserId={userId} typingText={typingText || ""} />
  }

  const keyExtractor = (item: AnyChat) => (item.chatType === "direct" ? `direct_${(item.user || item.participant)?._id}` : `group_${item.group?._id}`)

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={colors.background === '#0B0F14' ? 'light-content' : 'dark-content'} />
      <View style={{ paddingHorizontal: 12, paddingTop:Platform.OS == "android" ? (StatusBar.currentHeight || 0) + 20 : 0, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search"
            placeholderTextColor={colors.muted}
            style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, height: 40, color: colors.text, borderWidth: 1, borderColor: colors.border }}
          />
          <TouchableOpacity onPress={() => router.push('/groups/create')} style={{ backgroundColor: '#111827', paddingHorizontal: 12, height: 40, borderRadius: 10, justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>New Group</Text>
          </TouchableOpacity>
        </View>
      </View>
      {suggestions.length > 0 && (
        <View style={{ paddingVertical: 10 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}>
            {suggestions.slice(0, 12).map((s, idx) => (
              <View key={String(s?.user?._id || idx)} style={{ width: 180, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, backgroundColor: colors.surface }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Image source={{ uri: s?.user?.profilePic || 'https://i.pravatar.cc/100?img=19' }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#eee' }} />
                  <View style={{ marginLeft: 8, flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontWeight: '800', color: colors.text }}>{s?.user?.name || 'User'}</Text>
                    {s?.mutualCount > 0 && (<Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>Followed by {s.mutualNames.join(', ')}{s.mutualCount > s.mutualNames.length ? ` +${s.mutualCount - s.mutualNames.length}` : ''}</Text>)}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={async () => { try { await apiService.followUser(s?.user?._id) } catch {}; loadSuggestions(); }} style={{ flex: 1, backgroundColor: '#0095f6', borderRadius: 8, alignItems: 'center', paddingVertical: 8 }}>
                    <Text style={{ color: '#fff', fontWeight: '800' }}>Follow</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => router.push({ pathname: '/otherProfile', params: { userId: String(s?.user?._id || '') } })} style={{ width: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f2f2f2' }}>
                    <Ionicons name="person-outline" size={18} color="#333" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
      {suggestions.length === 0 && loading && (
        <View style={{ paddingHorizontal: 12 }}>
          <Skeleton height={16} width={'40%'} style={{ marginBottom: 8 }} />
          <Skeleton height={100} width={'100%'} radius={12} />
        </View>
      )}
      <FlatList
        data={chats}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  separator: { height: 1, backgroundColor: "#f2f2f2" },
})

 

