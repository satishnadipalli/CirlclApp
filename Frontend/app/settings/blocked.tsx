"use client"

import React, { useEffect, useState } from "react"
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, RefreshControl } from "react-native"
import { useRouter } from "expo-router"
import { apiService } from "@/services/api.service"

export default function BlockedUsersScreen() {
  const [blocked, setBlocked] = useState<any[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const router = useRouter()

  const load = async () => {
    try {
      const me: any = await apiService.getMe()
      const ids: string[] = (me?.blockedUsers || me?.user?.blockedUsers || []) as any
      if (!ids || ids.length === 0) { setBlocked([]); return }
      // fetch profiles
      const users: any[] = []
      for (const id of ids) {
        try {
          const r: any = await apiService.getUserProfile(String(id))
          if (r?.success) users.push(r.user)
          else users.push({ _id: id, name: id.slice(-4) })
        } catch { users.push({ _id: id, name: id.slice(-4) }) }
      }
      setBlocked(users)
    } catch { setBlocked([]) }
  }

  useEffect(() => { load() }, [])

  const onUnblock = async (userId: string) => {
    try {
      const r: any = await apiService.unblockUser(String(userId))
      if (r?.success !== false) {
        setBlocked((prev) => prev.filter((u) => String(u._id) !== String(userId)))
      }
    } catch {}
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text style={{ fontWeight: '800', fontSize: 18 }}>Blocked users</Text>
        <Text style={{ color: '#666' }}>People you’ve blocked won’t be able to message or find you.</Text>
      </View>
      <FlatList
        data={blocked}
        keyExtractor={(u) => String(u._id)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Image source={{ uri: item.profilePic || "https://i.pravatar.cc/100?img=11" }} style={styles.avatar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name || 'User'}</Text>
            </View>
            <TouchableOpacity onPress={() => onUnblock(String(item._id))} style={styles.unblockBtn}>
              <Text style={styles.unblockText}>Unblock</Text>
            </TouchableOpacity>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#eee', marginLeft: 68 }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false) }} />}
        ListEmptyComponent={() => (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: '#666' }}>No one blocked</Text>
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: '#eee' },
  name: { fontSize: 16, fontWeight: '600' },
  unblockBtn: { backgroundColor: '#111827', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  unblockText: { color: '#fff', fontWeight: '800' },
})