"use client"

import { ChatListItem } from "@/components/ChatListItem"
import { apiService } from "@/services/api.service"
import { socketService } from "@/services/socket.service"
import type { Chat } from "@/types/chat.types"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { Alert, FlatList, StyleSheet, Text, TextInput, View } from "react-native"

export function ChatsScreen() {
  const [search, setSearch] = useState("")
  const [chats, setChats] = useState<Chat[]>([] as any)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const router = useRouter()

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

  const fetchChats = async () => {
    try {
      if (!user) {
        console.log("[v0] User not loaded yet, skipping chat fetch")
        return
      }

      const chatsData = await apiService.getChats()
      console.log("[v0] Raw chats response:", chatsData)

      const chatsArray = chatsData?.chats || []
      console.log("[v0] Extracted chats array:", chatsArray)

      setChats(Array.isArray(chatsArray) ? (chatsArray as any) : [])
    } catch (err) {
      console.error("Error fetching chats:", err)
      setChats([] as any)
    } finally {
      setLoading(false)
    }
  }

  const setupRealTimeUpdates = async () => {
    try {
      if (!user) {
        console.log("[v0] User not loaded yet, skipping socket setup")
        return
      }

      await socketService.connect()
      socketService.registerUser(user._id)

      socketService.onReceiveDirectMessage((message) => {
        fetchChats()
      })

      socketService.onReceiveGroupMessage((message) => {
        fetchChats()
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

  const filteredChats = (chats || []).filter((chat: any) => {
    const searchTerm = search.toLowerCase()
    if (chat.chatType === "direct") {
      const participant = chat.user || chat.participant
      return participant?.name?.toLowerCase().includes(searchTerm) || false
    } else {
      return chat.group?.name?.toLowerCase().includes(searchTerm) || false
    }
  })

  const renderItem = ({ item }: { item: any }) => (
    <ChatListItem chat={item as any} currentUserId={user?._id || ""} />
  )

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
