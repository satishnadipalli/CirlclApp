"use client"

import { ChatListItem } from "@/components/ChatListItem"
import { apiService } from "@/services/api.service"
import { socketService } from "@/services/socket.service"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useRouter } from "expo-router"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { Alert, FlatList, LayoutAnimation, Platform, StyleSheet, Text, TextInput, UIManager, View, TouchableOpacity, StatusBar, Image, ScrollView } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import { Ionicons } from "@expo/vector-icons"

type AnyChat = any

export default function ChatsScreen() {
  const [search, setSearch] = useState("")
  const [chats, setChats] = useState<AnyChat[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string>("")
  const [typingState, setTypingState] = useState<Record<string, string>>({})
  const [suggestions, setSuggestions] = useState<Array<{ user: any; mutualCount: number; mutualNames: string[] }>>([])
  const router = useRouter()

  const directListenerRef = useRef<((msg: any) => void) | null>(null)
  const groupListenerRef = useRef<((msg: any) => void) | null>(null)

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
    fetchChats()
    loadSuggestions()
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
        setChats(sortChats(list))
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

    // typing
    socketService.onTyping((data: any) => {
      const fromId = data?.from
      if (!fromId || fromId === uid) return
      setTypingState((p) => ({ ...p, [fromId]: `${data?.name || "Someone"} is typing...` }))
      setTimeout(() => setTypingState((cur) => ({ ...cur, [fromId]: "" })), 1500)
    })
    socketService.onGroupTyping((data: any) => {
      const gid = data?.groupId
      const fromId = data?.from
      if (!gid || fromId === uid) return
      setTypingState((p) => ({ ...p, [gid]: `${data?.name || "Someone"} is typing...` }))
      setTimeout(() => setTypingState((cur) => ({ ...cur, [gid]: "" })), 1500)
    })
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
      // socketService.disconnect() // Do not disconnect global socket here; managed in Root layout
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      fetchChats() // fetch once on focus; rely on socket realtime updates afterward
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
    return <ChatListItem chat={item} currentUserId={userId} typingText={typingText || ""} />
  }

  const keyExtractor = (item: AnyChat) => (item.chatType === "direct" ? `direct_${(item.user || item.participant)?._id}` : `group_${item.group?._id}`)

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#f3f3f3" }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search"
          placeholderTextColor="#999"
          style={{ backgroundColor: "#f2f2f2", borderRadius: 10, paddingHorizontal: 12, height: 40, color: '#000' }}
        />
      </View>
      {suggestions.length > 0 && (
        <View style={{ paddingVertical: 10 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}>
            {suggestions.slice(0, 12).map((s, idx) => (
              <View key={String(s?.user?._id || idx)} style={{ width: 180, borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Image source={{ uri: s?.user?.profilePic || 'https://i.pravatar.cc/100?img=19' }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#eee' }} />
                  <View style={{ marginLeft: 8, flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontWeight: '800', color: '#000' }}>{s?.user?.name || 'User'}</Text>
                    {s?.mutualCount > 0 && (
                      <Text numberOfLines={1} style={{ color: '#666', fontSize: 12 }}>Followed by {s.mutualNames.join(', ')}{s.mutualCount > s.mutualNames.length ? ` +${s.mutualCount - s.mutualNames.length}` : ''}</Text>
                    )}
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
      <FlatList
        data={chats}
        keyExtractor={(_, idx) => String(idx)}
        renderItem={({ item }) => (
          <ChatListItem chat={item} currentUserId={userId} typingText={typingState[item?.chatType === 'direct' ? (item.user?._id || item.participant?._id) : item.group?._id] || ''} />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  separator: { height: 1, backgroundColor: "#f2f2f2" },
})

 

