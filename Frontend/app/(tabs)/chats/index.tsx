"use client"

import { ChatListItem } from "@/components/ChatListItem"
import { apiService } from "@/services/api.service"
import { socketService } from "@/services/socket.service"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useRouter } from "expo-router"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { Alert, FlatList, LayoutAnimation, Platform, StyleSheet, Text, TextInput, UIManager, View, TouchableOpacity } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

type AnyChat = any

export default function ChatsScreen() {
  const [search, setSearch] = useState("")
  const [chats, setChats] = useState<AnyChat[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string>("")
  const [typingState, setTypingState] = useState<Record<string, string>>({})
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
      fetchChats()
      const id = setInterval(fetchChats, 5000) // fallback polling in case socket missed
      return () => clearInterval(id)
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
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TextInput
          style={[styles.searchBar, { flex: 1, marginTop: 0 }]}
          placeholder="Search chats..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#666"
        />
        <TouchableOpacity onPress={() => router.push("/groups/create")} style={styles.createBtn}>
          <Text style={styles.createBtnText}>Create</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <Text style={{ textAlign: "center", marginTop: 20 }}>Loading chats...</Text>
      ) : !userId ? (
        <Text style={{ textAlign: "center", marginTop: 20 }}>Please login to view chats</Text>
      ) : filtered.length === 0 ? (
        <Text style={{ textAlign: "center", marginTop: 20 }}>No chats</Text>
      ) : (
        <FlatList data={filtered} keyExtractor={keyExtractor} renderItem={renderItem} ItemSeparatorComponent={() => <View style={styles.separator} />} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingTop: 50, gap: 8 },
  searchBar: { height: 40, paddingLeft: 16, borderRadius: 10, backgroundColor: "#f2f2f2", fontSize: 16 },
  createBtn: { backgroundColor: "#0095f6", height: 40, borderRadius: 10, paddingHorizontal: 12, justifyContent: "center" },
  createBtnText: { color: "#fff", fontWeight: "700" },
  separator: { height: 1, backgroundColor: "#eee", marginLeft: 75 },
})

 

