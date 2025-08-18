"use client"

import { apiService } from "@/services/api.service"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useLocalSearchParams, useRouter } from "expo-router"
import React, { useEffect, useMemo, useState } from "react"
import { Alert, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"

interface Member { _id: string; name: string; profilePic?: string }
interface Group {
  _id: string
  name: string
  description?: string
  groupPic?: string
  creator: string | Member
  admins: string[] | Member[]
  members: Member[]
}

export default function GroupDetailsScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>()
  const [group, setGroup] = useState<Group | null>(null)
  const [search, setSearch] = useState("")
  const router = useRouter()

  const isAdmin = (userId: string) => {
    const admins = (group?.admins || []) as any[]
    return admins.some((a) => (typeof a === "string" ? a : a._id) === userId)
  }

  const currentUserIdRef = React.useRef<string>("")
  useEffect(() => {
    (async () => {
      const userData = await AsyncStorage.getItem("user")
      const parsed = userData ? JSON.parse(userData) : null
      currentUserIdRef.current = parsed?.id || ""
    })()
  }, [])

  const loadGroup = async () => {
    try {
      const res = await apiService.getGroupInfo(groupId)
      if (res?.success) setGroup(res.group)
    } catch (e) {
      Alert.alert("Error", "Failed to load group details")
    }
  }

  useEffect(() => {
    loadGroup()
  }, [groupId])

  const members = useMemo(() => {
    const list = group?.members || []
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter((m) => m.name?.toLowerCase().includes(q))
  }, [group, search])

  const onAddMembers = async () => {
    try {
      // Simple prompt-like selection using search API for demo
      const token = await AsyncStorage.getItem("token")
      if (!token) return
      const resp = await fetch(`http://192.168.53.127:5000/api/users/search?q=${encodeURIComponent(search || "a")}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await resp.json()
      const pool: Member[] = Array.isArray(data?.users) ? data.users : []
      const existing = new Set((group?.members || []).map((m) => m._id))
      const candidates = pool.filter((u) => !existing.has(u._id)).slice(0, 5)
      if (candidates.length === 0) return Alert.alert("No users to add")
      const res = await apiService.addGroupMembers(groupId, candidates.map((c) => c._id))
      if (res?.success) {
        await loadGroup()
      } else {
        Alert.alert("Failed", res?.message || "Could not add members")
      }
    } catch (e) {
      Alert.alert("Error", (e as Error).message)
    }
  }

  const onRemoveMember = async (memberId: string) => {
    try {
      const res = await apiService.removeGroupMember(groupId, memberId)
      if (res?.success) {
        await loadGroup()
      } else {
        Alert.alert("Failed", res?.message || "Could not remove member")
      }
    } catch (e) {
      Alert.alert("Error", (e as Error).message)
    }
  }

  const onPromote = async (memberId: string) => {
    try {
      const res = await apiService.promoteToAdmin(groupId, memberId)
      if (res?.success) await loadGroup()
    } catch (e) {
      Alert.alert("Error", (e as Error).message)
    }
  }

  const onDemote = async (memberId: string) => {
    try {
      const res = await apiService.demoteAdmin(groupId, memberId)
      if (res?.success) await loadGroup()
    } catch (e) {
      Alert.alert("Error", (e as Error).message)
    }
  }

  if (!group) return <View style={styles.container}><Text style={styles.loading}>Loading...</Text></View>

  const meIsAdmin = isAdmin(currentUserIdRef.current)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>{"‹"}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{group.name}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.groupHero}>
        <Image source={{ uri: group.groupPic || "https://i.pravatar.cc/150?img=14" }} style={styles.heroAvatar} />
        <Text style={styles.heroName}>{group.name}</Text>
        {group.description ? <Text style={styles.heroDesc}>{group.description}</Text> : null}
      </View>

      <View style={styles.actionsBar}>
        <TextInput
          placeholder="Search members"
          value={search}
          onChangeText={setSearch}
          style={styles.search}
        />
        {meIsAdmin && (
          <TouchableOpacity onPress={onAddMembers}>
            <Text style={styles.addBtn}>Add</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={members}
        keyExtractor={(m) => m._id}
        renderItem={({ item }) => {
          const isItemAdmin = isAdmin(item._id)
          return (
            <View style={styles.row}>
              <Image source={{ uri: item.profilePic || "https://i.pravatar.cc/100?img=12" }} style={styles.rowAvatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.name}</Text>
                {isItemAdmin && <Text style={styles.rowRole}>Admin</Text>}
              </View>
              {meIsAdmin && currentUserIdRef.current !== item._id && (
                <View style={styles.rowActions}>
                  {isItemAdmin ? (
                    <TouchableOpacity onPress={() => onDemote(item._id)}>
                      <Text style={styles.actionDanger}>Remove admin</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => onPromote(item._id)}>
                      <Text style={styles.actionPrimary}>Make admin</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => onRemoveMember(item._id)}>
                    <Text style={styles.actionDanger}>Remove</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )
        }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 50 },
  header: { paddingHorizontal: 16, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { fontSize: 24 },
  title: { fontSize: 18, fontWeight: "700" },
  groupHero: { alignItems: "center", paddingVertical: 12 },
  heroAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#eee" },
  heroName: { fontSize: 20, fontWeight: "700", marginTop: 8 },
  heroDesc: { fontSize: 12, color: "#666", marginTop: 4 },
  actionsBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 8, marginVertical: 8 },
  search: { flex: 1, backgroundColor: "#f2f2f2", borderRadius: 10, paddingHorizontal: 12, height: 40 },
  addBtn: { color: "#0095f6", fontSize: 16, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  rowAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: "#eee" },
  rowName: { fontSize: 16, fontWeight: "600" },
  rowRole: { fontSize: 12, color: "#666" },
  rowActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  actionPrimary: { color: "#0095f6", fontSize: 12, fontWeight: "600" },
  actionDanger: { color: "#f33", fontSize: 12, fontWeight: "600" },
  sep: { height: 1, backgroundColor: "#eee", marginLeft: 68 },
})

