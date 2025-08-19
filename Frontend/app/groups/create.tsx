"use client"

import { apiService } from "@/services/api.service"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useRouter } from "expo-router"
import React, { useEffect, useState } from "react"
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator, Image, ScrollView } from "react-native"
import Icon from "react-native-vector-icons/MaterialIcons"

interface UserLite { _id: string; name: string; profilePic?: string; username?: string }

export default function CreateGroupScreen() {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [friends, setFriends] = useState<UserLite[]>([])
  const [followersPage, setFollowersPage] = useState(1)
  const [hasMoreFollowers, setHasMoreFollowers] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState("")
  const [searchResults, setSearchResults] = useState<UserLite[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const meIdRef = React.useRef<string>("")
  const [debounceId, setDebounceId] = useState<any>(null)

  // Load followers by default with pagination (20 per page)
  useEffect(() => {
    ;(async () => {
      try {
        const token = await AsyncStorage.getItem("token")
        if (!token) return
        let myId = ""
        try {
          const me = await apiService.getMe()
          const meData = me as any
          myId = meData?._id || meData?.user?._id || ""
        } catch {}
        if (!myId) {
          const raw = await AsyncStorage.getItem("user")
          const parsed = raw ? JSON.parse(raw) : null
          myId = parsed?.id || parsed?._id || ""
        }
        meIdRef.current = myId
        if (myId) {
          const resp = await apiService.getFollowers(myId, 1, 20)
          const users = (resp as any)?.users || []
          setFriends(users)
          setFollowersPage(2)
          setHasMoreFollowers(((resp as any)?.page || 1) < ((resp as any)?.pages || 1))
        } else {
          setFriends([])
          setHasMoreFollowers(false)
        }
      } catch (e) {
        console.log("load followers error", e)
      }
    })()
  }, [])

  // Search users by name/username/email
  const doSearch = async (q: string) => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token) return
      const query = q.trim()
      if (!query) return
      setSearchLoading(true)
      const res = await apiService.searchUsers(query, 1, 20)
      const users: UserLite[] = Array.isArray((res as any)?.users) ? (res as any).users : []
      // Exclude self and de-dup with current list
      const unique = new Map<string, UserLite>()
      users.forEach((u) => {
        if (u && u._id !== meIdRef.current) unique.set(u._id, u)
      })
      setSearchResults(Array.from(unique.values()))
    } catch (e) {
      console.log("search error", e)
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  const loadMoreFollowers = async () => {
    if (loadingMore || !hasMoreFollowers) return
    setLoadingMore(true)
    try {
      const myId = meIdRef.current
      const resp = await apiService.getFollowers(myId, followersPage, 20)
      const next = (resp as any)?.users || []
      setFriends((prev) => [...prev, ...next])
      setFollowersPage((p) => p + 1)
      setHasMoreFollowers(((resp as any)?.page || 1) < ((resp as any)?.pages || 1))
    } catch (e) {
      console.log("pagination error", e)
    } finally {
      setLoadingMore(false)
    }
  }

  const toggle = (id: string) => setSelected((p) => ({ ...p, [id]: !p[id] }))

  const onCreate = async () => {
    if (!name.trim()) return Alert.alert("Group name required")
    setLoading(true)
    try {
      const memberIds = Object.keys(selected).filter((id) => selected[id])
      const res = await apiService.createGroup(name.trim(), description.trim(), memberIds)
      if (res?.success && res?.group?._id) {
        router.replace(`/groups/${res.group._id}`)
      } else {
        Alert.alert("Failed", res?.message || "Could not create group")
      }
    } catch (e) {
      Alert.alert("Error", (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const dataToRender = search.trim().length >= 2 ? searchResults : friends
  const selectedUsers: UserLite[] = (() => {
    const byId = new Map<string, UserLite>()
    ;[...friends, ...searchResults].forEach((u) => {
      if (u && selected[u._id]) byId.set(u._id, u)
    })
    return Array.from(byId.values())
  })()

  const canCreate = name.trim().length > 0

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>New Group</Text>
        <TouchableOpacity onPress={onCreate} disabled={loading || !canCreate}>
          <Text style={[styles.createBtn, (loading || !canCreate) && { opacity: 0.5 }]}>
            Create{selectedUsers.length > 0 ? ` (${selectedUsers.length})` : ""}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.card}>
        <TextInput placeholder="Group name" style={styles.input} value={name} onChangeText={setName} />
        <TextInput placeholder="Description (optional)" style={[styles.input, { height: 80 }]} value={description} onChangeText={setDescription} multiline />
        <View style={styles.searchContainer}>
          <Icon name="search" size={20} color="#666" style={styles.searchIcon} />
          <TextInput
            placeholder="Search people by name or username"
            placeholderTextColor="#888"
            style={styles.searchInput}
            value={search}
            onChangeText={(t) => {
              setSearch(t)
              if (debounceId) clearTimeout(debounceId)
              const id = setTimeout(() => {
                if (t.trim().length >= 2) doSearch(t)
                else setSearchResults([])
              }, 300)
              setDebounceId(id)
            }}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => { setSearch(""); setSearchResults([]) }} style={styles.clearBtn}>
              <Icon name="close" size={18} color="#999" />
            </TouchableOpacity>
          )}
        </View>
        {selectedUsers.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectedChips}>
            {selectedUsers.map((u) => (
              <View key={u._id} style={styles.chip}>
                <Image source={{ uri: u.profilePic || "https://i.pravatar.cc/100?img=12" }} style={styles.chipAvatar} />
                <Text style={styles.chipText} numberOfLines={1}>{u.name}</Text>
                <TouchableOpacity onPress={() => toggle(u._id)} style={styles.chipRemove}>
                  <Icon name="close" size={14} color="#666" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      <Text style={styles.section}>{search.trim().length >= 2 ? "Search Results" : "Suggested (Followers)"}</Text>
      <FlatList
        data={dataToRender}
        keyExtractor={(u) => u._id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => toggle(item._id)}>
            <Image source={{ uri: item.profilePic || "https://i.pravatar.cc/100?img=12" }} style={styles.avatar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              {!!item.username && <Text style={styles.username}>@{item.username}</Text>}
            </View>
            <View style={[styles.checkPill, selected[item._id] && styles.checkPillOn]}>
              <Text style={[styles.checkText, selected[item._id] && styles.checkTextOn]}>{selected[item._id] ? "Selected" : "Select"}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={() => (
          <View style={{ paddingVertical: 30, alignItems: "center" }}>
            {searchLoading ? <ActivityIndicator /> : <Text style={{ color: "#666" }}>No users found</Text>}
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        onEndReached={search.trim().length >= 2 ? undefined : loadMoreFollowers}
        onEndReachedThreshold={0.2}
        ListFooterComponent={(() => {
          if (search.trim().length >= 2) return searchLoading ? <View style={{ paddingVertical: 12 }}><ActivityIndicator /></View> : null
          return loadingMore ? <View style={{ paddingVertical: 12 }}><ActivityIndicator /></View> : null
        })()}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 50 },
  header: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "700" },
  createBtn: { color: "#0095f6", fontSize: 16, fontWeight: "600" },
  card: { backgroundColor: "#fff", marginHorizontal: 12, marginTop: 12, borderWidth: 1, borderColor: "#eee", borderRadius: 14, paddingVertical: 10, paddingHorizontal: 10 },
  input: { marginHorizontal: 6, marginTop: 8, backgroundColor: "#f7f7f7", borderRadius: 10, paddingHorizontal: 12, height: 44, borderWidth: 1, borderColor: "#eee" },
  searchContainer: { flexDirection: "row", alignItems: "center", marginHorizontal: 6, marginTop: 10, backgroundColor: "#f7f7f7", borderRadius: 10, borderWidth: 1, borderColor: "#eee" },
  searchIcon: { marginLeft: 10 },
  searchInput: { flex: 1, height: 44, paddingHorizontal: 10, color: "#000" },
  clearBtn: { paddingHorizontal: 10, height: 44, justifyContent: "center", alignItems: "center" },
  selectedChips: { paddingHorizontal: 6, paddingTop: 8, paddingBottom: 2, gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", backgroundColor: "#eef6ff", borderRadius: 16, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: "#d9ebff", marginRight: 6 },
  chipAvatar: { width: 20, height: 20, borderRadius: 10, marginRight: 6, backgroundColor: "#ddd" },
  chipText: { maxWidth: 120, color: "#0b5ed7", fontWeight: "600", fontSize: 12 },
  chipRemove: { marginLeft: 6 },
  section: { marginTop: 16, marginHorizontal: 16, fontSize: 14, color: "#666" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: "#eee" },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: "#999", marginRight: 12 },
  checkboxOn: { backgroundColor: "#0095f6", borderColor: "#0095f6" },
  name: { fontSize: 16, fontWeight: "600" },
  username: { fontSize: 12, color: "#666" },
  checkPill: { borderWidth: 1, borderColor: "#ccc", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  checkPillOn: { borderColor: "#0095f6" },
  checkText: { color: "#666", fontWeight: "600" },
  checkTextOn: { color: "#0095f6" },
  sep: { height: 1, backgroundColor: "#eee", marginLeft: 48 },
})

