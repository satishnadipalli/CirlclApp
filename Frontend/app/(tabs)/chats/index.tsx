"use client"

import { ChatListItem } from "@/components/ChatListItem"
import { apiService } from "@/services/api.service"
import { socketService } from "@/services/socket.service"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useRouter } from "expo-router"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { Alert, FlatList, LayoutAnimation, Platform, StyleSheet, Text, TextInput, UIManager, View } from "react-native"
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
  }, [])

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
        : { chatType: "group", group: c.group, lastMessage: c.lastMessage, unreadCount: c.unreadCount || 0 },
    )

  const fetchChats = async () => {
    try {
      if (!userId) return
      const res = await apiService.getChats()
      const list = normalize(Array.isArray(res?.chats) ? res.chats : [])
      setChats((prev) => sortChats(list))
    } catch (e) {
      console.error("fetch chats error", e)
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
    await socketService.connect()
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
              lastMessage: { text: message.text, createdAt, from: { name: fromName } },
              unreadCount: message.from !== uid ? 1 : 0,
            },
          }
        }
        const chat = list[idx]
        return {
          idx,
          updated: {
            ...chat,
            lastMessage: { ...(chat.lastMessage || {}), text: message.text, createdAt, from: { name: fromName } },
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
        return {
          idx,
          updated: {
            ...chat,
            lastMessage: { ...(chat.lastMessage || {}), text: message.text, createdAt, from: { name: message.from === uid ? "You" : "" } },
            unreadCount: (chat.unreadCount || 0) + 1,
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
      socketService.disconnect()
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      fetchChats()
      const id = setInterval(fetchChats, 5000) // fallback polling
      return () => clearInterval(id)
    }, []),
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
      <TextInput style={styles.searchBar} placeholder="Search chats..." value={search} onChangeText={setSearch} />
      {loading ? (
        <Text style={{ textAlign: "center", marginTop: 20 }}>Loading chats...</Text>
      ) : !userId ? (
        <Text style={{ textAlign: "center", marginTop: 20 }}>Please login to view chats</Text>
      ) : (
        <FlatList data={filtered} keyExtractor={keyExtractor} renderItem={renderItem} ItemSeparatorComponent={() => <View style={styles.separator} />} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  searchBar: { height: 40, margin: 10, marginTop: 50, paddingLeft: 16, borderRadius: 10, backgroundColor: "#d3d3d3ff", fontSize: 16 },
  separator: { height: 1, backgroundColor: "#eee", marginLeft: 75 },
})

"use client"

import React from "react"
import { Text, View, StyleSheet, TouchableOpacity } from "react-native"
import { useRouter } from "expo-router"

export default function ChatsTabPlaceholder() {
  const router = useRouter()
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chats</Text>
      <TouchableOpacity onPress={() => router.push("/groups")}> 
        <Text style={styles.link}>Open Groups</Text>
      </TouchableOpacity>
      <Text style={styles.note}>This placeholder is shown because the chats screen file was empty. I will restore the full chats list shortly.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", paddingTop: 50 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  link: { color: "#0095f6", fontWeight: "700", marginTop: 4 },
  note: { color: "#777", fontSize: 12, marginTop: 10, textAlign: "center", paddingHorizontal: 32 },
})

