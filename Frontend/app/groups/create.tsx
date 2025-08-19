"use client"

import { apiService } from "@/services/api.service"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useRouter } from "expo-router"
import React, { useEffect, useState } from "react"
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator, Image } from "react-native"

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
        const me = await apiService.getMe()
        const meData = me as any
        const myId = meData?._id || meData?.user?._id || ""
        meIdRef.current = myId
        const resp = await apiService.getFollowers(myId, 1, 20)
        const users = (resp as any)?.users || []
        setFriends(users)
        setFollowersPage(2)
        setHasMoreFollowers(((resp as any)?.page || 1) < ((resp as any)?.pages || 1))
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
      if (!q.trim()) return
      const response = await fetch(`http://192.168.53.127:5000/api/users/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      const users: UserLite[] = Array.isArray(data?.users) ? data.users : []
      // merge with existing without duplicates
      const map = new Map<string, UserLite>()
      ;[...friends, ...users].forEach((u) => u && u._id !== meIdRef.current && map.set(u._id, u))
      setFriends(Array.from(map.values()))
    } catch (e) {
      console.log("search error", e)
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>New Group</Text>
        <TouchableOpacity onPress={onCreate} disabled={loading}>
          <Text style={[styles.createBtn, loading && { opacity: 0.6 }]}>Create</Text>
        </TouchableOpacity>
      </View>
      <TextInput placeholder="Group name" style={styles.input} value={name} onChangeText={setName} />
      <TextInput placeholder="Description (optional)" style={[styles.input, { height: 80 }]} value={description} onChangeText={setDescription} multiline />
      <View style={styles.searchRow}>
        <TextInput
          placeholder="Search people..."
          placeholderTextColor="#666"
          style={[styles.input, { flex: 1, marginHorizontal: 0 }]}
          value={search}
          onChangeText={(t) => {
            setSearch(t)
            if (debounceId) clearTimeout(debounceId)
            const id = setTimeout(() => {
              if (t.trim().length >= 2) doSearch(t)
            }, 300)
            setDebounceId(id)
          }}
        />
      </View>
      <Text style={styles.section}>Followers & Results</Text>
      <FlatList
        data={friends}
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
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        onEndReached={loadMoreFollowers}
        onEndReachedThreshold={0.2}
        ListFooterComponent={loadingMore ? (
          <View style={{ paddingVertical: 12 }}><ActivityIndicator /></View>
        ) : null}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 50 },
  header: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "700" },
  createBtn: { color: "#0095f6", fontSize: 16, fontWeight: "600" },
  input: { marginHorizontal: 16, marginTop: 10, backgroundColor: "#f2f2f2", borderRadius: 10, paddingHorizontal: 12, height: 44 },
  searchRow: { marginHorizontal: 16, marginTop: 10 },
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

