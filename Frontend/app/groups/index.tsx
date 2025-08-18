"use client"

import { apiService } from "@/services/api.service"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useRouter } from "expo-router"
import React, { useEffect, useState } from "react"
import { Alert, FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native"

interface GroupItem {
  _id: string
  name: string
  groupPic?: string
  members?: Array<{ _id: string }>
  admins?: Array<{ _id: string }>
}

export default function GroupsScreen() {
  const [groups, setGroups] = useState<GroupItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const router = useRouter()

  const fetchGroups = async () => {
    try {
      const token = await AsyncStorage.getItem("token")
      if (!token) {
        Alert.alert("Login required", "Please log in to manage groups")
        return
      }
      const res = await apiService.getUserGroups()
      const list = Array.isArray(res?.groups) ? res.groups : []
      setGroups(list as GroupItem[])
    } catch (e) {
      console.error("Error loading groups:", e)
      setGroups([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchGroups()
  }, [])

  const onRefresh = () => {
    setRefreshing(true)
    fetchGroups()
  }

  const renderItem = ({ item }: { item: GroupItem }) => {
    const memberCount = item?.members?.length || 0
    return (
      <TouchableOpacity style={styles.card} onPress={() => router.push(`/groups/${item._id}`)}>
        <Image
          source={{ uri: item.groupPic || "https://i.pravatar.cc/150?img=14" }}
          style={styles.avatar}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.subtitle}>{memberCount} members</Text>
        </View>
        <Text style={styles.chevron}>{"›"}</Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Groups</Text>
        <TouchableOpacity onPress={() => router.push("/groups/create")}> 
          <Text style={styles.createBtn}>Create</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <Text style={styles.loading}>Loading...</Text>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g._id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 50 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 24, fontWeight: "700" },
  createBtn: { color: "#0095f6", fontSize: 16, fontWeight: "600" },
  loading: { textAlign: "center", marginTop: 20 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
  },
  avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12, backgroundColor: "#eee" },
  name: { fontSize: 16, fontWeight: "600" },
  subtitle: { fontSize: 12, color: "#666", marginTop: 2 },
  chevron: { fontSize: 28, color: "#bbb", paddingHorizontal: 8 },
  separator: { height: 1, backgroundColor: "#eee", marginLeft: 76 },
})

