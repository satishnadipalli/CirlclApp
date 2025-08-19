"use client"

import { apiService } from "@/services/api.service"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useLocalSearchParams, useRouter } from "expo-router"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { Alert, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"
import Icon from "react-native-vector-icons/MaterialIcons"

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
  const searchInputRef = useRef<TextInput>(null)

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
      if (!search.trim()) return Alert.alert("Type a name to search")
      const data = await apiService.searchUsers(search.trim(), 1, 20, String(groupId))
      const pool: Member[] = Array.isArray((data as any)?.users) ? (data as any).users : []
      const existing = new Set((group?.members || []).map((m) => m._id))
      const candidates = pool.filter((u) => !existing.has(u._id))
      if (candidates.length === 0) return Alert.alert("No matching users to add")
      const res = await apiService.addGroupMembers(groupId, candidates.map((c) => c._id))
      if (res?.success) {
        await loadGroup()
      } else {
        console.log("add new")
        Alert.alert("Failed", res?.message || "Could not add members")
      }
    } catch (e) {
      console.log("error")
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
        {meIsAdmin ? (
          <TouchableOpacity onPress={() => searchInputRef.current?.focus()}>
            <Icon name="person-add" size={22} color="#0095f6" />
            <Text>Add</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <View style={styles.groupHero}>
        <Image source={{ uri: group.groupPic || "https://i.pravatar.cc/150?img=14" }} style={styles.heroAvatar} />
        <Text style={styles.heroName}>{group.name}</Text>
        {group.description ? <Text style={styles.heroDesc}>{group.description}</Text> : null}
        {/* add button moved to header */}
      </View>

      <View style={styles.actionsBar}>
        <TextInput
          placeholder="Type a name to find people to add"
          value={search}
          onChangeText={setSearch}
          style={[styles.search, { height: 44 }]}
          ref={searchInputRef}
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
          const meId = currentUserIdRef.current
          return (
            <View style={styles.row}>
              <Image source={{ uri: item.profilePic || "https://i.pravatar.cc/100?img=12" }} style={styles.rowAvatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.name}</Text>
                {isItemAdmin && <Text style={styles.rowRole}>Admin</Text>}
              </View>
              {meId !== item._id && (
                <View style={styles.rowActions}>
                  {/* Follow/Unfollow button */}
                  <FollowButton memberId={item._id} />
                  {/* Admin actions (only if I am admin) */}
                  {meIsAdmin && (
                    <>
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
                    </>
                  )}
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

const FollowButton: React.FC<{ memberId: string }> = ({ memberId }) => {
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const myIdRef = React.useRef<string>("")

  useEffect(() => {
    ;(async () => {
      const userData = await AsyncStorage.getItem("user")
      const me = userData ? JSON.parse(userData) : null
      myIdRef.current = me?.id || ""
      try {
        const meResp = await apiService.getMe()
        const meDoc = (meResp as any) || {}
        const following: string[] = meDoc?.following || meDoc?.data?.following || meDoc?.user?.following || []
        setIsFollowing(following.some((id) => id === memberId))
      } catch {}
    })()
  }, [memberId])

  const toggle = async () => {
    if (busy || isFollowing == null) return
    setBusy(true)
    try {
      if (isFollowing) {
        await apiService.unfollowUser(memberId)
        setIsFollowing(false)
      } else {
        await apiService.followUser(memberId)
        setIsFollowing(true)
      }
    } catch (e) {
      Alert.alert("Error", (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (isFollowing == null) return null

  return (
    <TouchableOpacity onPress={toggle} disabled={busy}>
      <Text style={[isFollowing ? styles.followingBtn : styles.followBtn]}>
        {isFollowing ? "Following" : busy ? "..." : "Follow"}
      </Text>
    </TouchableOpacity>
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
  followBtn: { color: "#fff", backgroundColor: "#0095f6", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, overflow: "hidden", fontSize: 12, fontWeight: "700" },
  followingBtn: { color: "#0095f6", borderColor: "#0095f6", borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, overflow: "hidden", fontSize: 12, fontWeight: "700" },
  addFab: { position: "absolute", right: 16, top: 8, backgroundColor: "#0095f6", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  addFabText: { color: "#fff", fontSize: 16, fontWeight: "800" },
})

