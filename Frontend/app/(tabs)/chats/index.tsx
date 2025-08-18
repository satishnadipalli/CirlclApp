"use client"

import { ChatListItem } from "@/components/ChatListItem"
import { apiService } from "@/services/api.service"
import { socketService } from "@/services/socket.service"
import type { Chat } from "@/types/chat.types"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useRouter } from "expo-router"
import React, { useCallback, useEffect, useState } from "react"
import { Alert, FlatList, LayoutAnimation, Platform, StyleSheet, Text, TextInput, UIManager, View } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

export function ChatsScreen() {
  const [search, setSearch] = useState("")
  const [chats, setChats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [typingState, setTypingState] = useState<Record<string, string>>({}) // key: chatId, value: text
  const router = useRouter()

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true)
    }
  }, [])

  const loadUserFromStorage = async () => {
    try {
      const userData = await AsyncStorage.getItem("user")
      const token = await AsyncStorage.getItem("token")

      if (userData && token) {
        const parsedUser = JSON.parse(userData)
        const formattedUser: User = {
          _id: parsedUser.id,
          name: parsedUser.name,
          email: parsedUser.email,
          profilePic: parsedUser.profilePic || "",
        }
        setUser(formattedUser)
        return formattedUser
      } else {
        throw new Error("No user data or token found in storage")
      }
    } catch (error) {
      console.error("Error loading user from storage:", error)
      Alert.alert("Error", "Please login again")
      throw error
    }
  }

  const sortChats = (list: any[]) => {
    return [...list].sort((a, b) => {
      const aTime = a?.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0
      const bTime = b?.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0
      return bTime - aTime
    })
  }

  const fetchChats = async () => {
    try {
      if (!user) {
        console.log("[v0] User not loaded yet, skipping chat fetch")
        return
      }

      const chatsData = await apiService.getChats()
      const chatsArray = Array.isArray(chatsData?.chats) ? (chatsData.chats as any[]) : []
      setChats(sortChats(chatsArray))
    } catch (err) {
      console.error("Error fetching chats:", err)
      setChats([])
    } finally {
      setLoading(false)
    }
  }

  const ensureDirectPeerInfo = async (peerId: string) => {
    try {
      const res = await apiService.getUserProfile(peerId)
      if (!res?.success) return
      const peer = res
      setChats((prev) =>
        prev.map((c) =>
          c.chatType === "direct" && (c.user || c.participant)?._id === peerId
            ? { ...c, user: { _id: peerId, name: peer.name || peer.data?.name || "", profilePic: peer.profilePic || peer.data?.profilePic || "" } }
            : c,
        ),
      )
    } catch {}
  }

  const ensureGroupInfo = async (groupId: string) => {
    if (!groupId) return
    try {
      const res = await apiService.getGroupInfo(groupId)
      if (!res?.success) return
      const grp = res.group || res.data?.group
      if (!grp) return
      setChats((prev) => prev.map((c) => (c.chatType === "group" && c.group?._id === groupId ? { ...c, group: grp } : c)))
    } catch {}
  }

  const bumpChatOnMessage = (updater: (list: any[]) => { idx: number; updated: any } | { insert: any } | null) => {
    setChats((prev) => {
      const res = updater(prev)
      if (!res) return prev
      let list = [...prev]
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      if ((res as any).insert) {
        list.unshift((res as any).insert)
      } else {
        const { idx, updated } = res as any
        if (idx < 0) return prev
        list.splice(idx, 1)
        list.unshift(updated)
      }
      // Always resort by latest message time
      list = sortChats(list)
      return list
    })
  }

  const setupRealTimeUpdates = async () => {
    try {
      if (!user) return
      await socketService.connect()
      socketService.registerUser(user._id)

      socketService.onReceiveDirectMessage((message: any) => {
        const peerId = message.from === user._id ? message.to : message.from
        bumpChatOnMessage((list) => {
          const idx = list.findIndex((c) => c.chatType === "direct" && ((c.user || c.participant)?._id === peerId))
          const createdAt = (message.createdAt && typeof message.createdAt === 'string') ? message.createdAt : new Date().toISOString()
          const fromName = message.from === user._id ? "You" : ((idx !== -1 && (list[idx].user || list[idx].participant)?.name) || "")
          if (idx === -1) {
            // create a minimal chat so it appears immediately
            // then asynchronously fetch the peer info to fill name/avatar
            ensureDirectPeerInfo(peerId)
            return {
              insert: {
                chatType: "direct",
                user: { _id: peerId, name: "", profilePic: "" },
                lastMessage: { text: message.text, createdAt, from: { name: fromName } },
                unreadCount: message.from !== user._id ? 1 : 0,
              },
            }
          }
          const chat = list[idx]
          const updated = {
            ...chat,
            lastMessage: {
              ...(chat.lastMessage || {}),
              text: message.text,
              createdAt,
              from: { name: fromName },
            },
            unreadCount: (message.from !== user._id) ? ((chat.unreadCount || 0) + 1) : (chat.unreadCount || 0),
          }
          return { idx, updated }
        })
      })

      socketService.onReceiveGroupMessage((message: any) => {
        const groupId = message.group
        bumpChatOnMessage((list) => {
          const idx = list.findIndex((c) => c.chatType === "group" && c.group?._id === groupId)
          const createdAt = (message.createdAt && typeof message.createdAt === 'string') ? message.createdAt : new Date().toISOString()
          const fromName = message.from === user._id ? "You" : ""
          if (idx === -1) {
            // create minimal and fetch group info to fill name
            if (groupId) ensureGroupInfo(groupId)
            return {
              insert: {
                chatType: "group",
                group: { _id: groupId, name: "", groupPic: "" },
                lastMessage: { text: message.text, createdAt, from: { name: fromName } },
                unreadCount: 1,
              },
            }
          }
          const chat = list[idx]
          const updated = {
            ...chat,
            lastMessage: {
              ...(chat.lastMessage || {}),
              text: message.text,
              createdAt,
              from: { name: fromName },
            },
            unreadCount: (chat.unreadCount || 0) + 1,
          }
          return { idx, updated }
        })
      })

      socketService.onTyping((data: any) => {
        // direct typing
        const fromId = data?.from
        if (!fromId || fromId === user._id) return
        setTypingState((prev) => ({ ...prev, [fromId]: `${data?.name || "Someone"} is typing...` }))
        setTimeout(() => setTypingState((cur) => ({ ...cur, [fromId]: "" })), 1500)
      })

      socketService.onGroupTyping((data: any) => {
        const groupId = data?.groupId
        const fromId = data?.from
        if (!groupId || fromId === user._id) return
        setTypingState((prev) => ({ ...prev, [groupId]: `${data?.name || "Someone"} is typing...` }))
        setTimeout(() => setTypingState((cur) => ({ ...cur, [groupId]: "" })), 1500)
      })

      socketService.onStopTyping((data: any) => {
        const fromId = data?.from
        if (!fromId) return
        setTypingState((prev) => ({ ...prev, [fromId]: "" }))
      })
    } catch (error) {
      console.error("Error setting up real-time updates:", error)
    }
  }

  useEffect(() => {
    const initializeScreen = async () => {
      try {
        const loadedUser = await loadUserFromStorage()
        if (loadedUser) {
          await fetchChats()
          await setupRealTimeUpdates()
        }
      } catch (error) {
        console.error("Error initializing screen:", error)
        setLoading(false)
      }
    }

    initializeScreen()

    return () => {
      socketService.disconnect()
    }
  }, [])

  useEffect(() => {
    if (user) {
      fetchChats()
      setupRealTimeUpdates()
    }
  }, [user])

  useFocusEffect(
    useCallback(() => {
      // when screen regains focus, refresh chats to sync unread from backend
      fetchChats()
      return () => {}
    }, [])
  )

  const filteredChats = (chats || []).filter((chat: any) => {
    const searchTerm = search.toLowerCase()
    if (chat.chatType === "direct") {
      const participant = chat.user || chat.participant
      return participant?.name?.toLowerCase().includes(searchTerm) || false
    } else {
      return chat.group?.name?.toLowerCase().includes(searchTerm) || false
    }
  })

  const renderItem = ({ item }: { item: any }) => {
    const typingText = item.chatType === "direct"
      ? typingState[(item.user || item.participant)?._id]
      : typingState[item.group?._id]
    return (
      <ChatListItem
        chat={item as any}
        currentUserId={user?._id || ""}
        typingText={typingText}
      />
    )
  }

  const getItemKey = (item: any) => {
    return item.chatType === "direct"
      ? `direct_${(item.user || item.participant)?._id}`
      : `group_${item.group?._id}`
  }

  return (
    <View style={styles.container}>
      <TextInput style={styles.searchBar} placeholder="Search chats..." value={search} onChangeText={setSearch} />

      {loading ? (
        <Text style={{ textAlign: "center", marginTop: 20 }}>Loading chats...</Text>
      ) : !user ? (
        <Text style={{ textAlign: "center", marginTop: 20 }}>Please login to view chats</Text>
      ) : (
        <FlatList
          data={filteredChats}
          keyExtractor={getItemKey}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshing={loading}
          onRefresh={fetchChats}
        />
      )}
    </View>
  )
}

export default ChatsScreen

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  searchBar: {
    height: 40,
    margin: 10,
    marginTop: 50,
    paddingLeft: 16,
    borderRadius: 10,
    backgroundColor: "#d3d3d3ff",
    fontSize: 16,
  },
  listItem: { paddingVertical: 10, paddingHorizontal: 15 },
  separator: { height: 1, backgroundColor: "#eee", marginLeft: 75 },
  rightContainer: { justifyContent: "center", alignItems: "flex-end" },
  timeText: { fontSize: 12, color: "#888", marginBottom: 5 },
})
