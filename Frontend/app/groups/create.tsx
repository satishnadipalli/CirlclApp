"use client"

import { apiService } from "@/services/api.service"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useRouter } from "expo-router"
import React, { useEffect, useState } from "react"
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"

interface UserLite { _id: string; name: string }

export default function CreateGroupScreen() {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [friends, setFriends] = useState<UserLite[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // Minimal: reuse search API to find people (or load from your social graph)
    (async () => {
      try {
        const token = await AsyncStorage.getItem("token")
        if (!token) return
        // Load top 20 users for selection (demo via search empty yields none; adapt as needed)
        const resp = await fetch("http://192.168.53.127:5000/api/users/search?q=a", { headers: { Authorization: `Bearer ${token}` } })
        const data = await resp.json()
        setFriends(Array.isArray(data?.users) ? data.users : [])
      } catch {}
    })()
  }, [])

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
      <TextInput placeholder="Description (optional)" style={styles.input} value={description} onChangeText={setDescription} />

      <Text style={styles.section}>Select members</Text>
      <FlatList
        data={friends}
        keyExtractor={(u) => u._id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => toggle(item._id)}>
            <View style={[styles.checkbox, selected[item._id] && styles.checkboxOn]} />
            <Text style={styles.name}>{item.name}</Text>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
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
  section: { marginTop: 16, marginHorizontal: 16, fontSize: 14, color: "#666" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: "#999", marginRight: 12 },
  checkboxOn: { backgroundColor: "#0095f6", borderColor: "#0095f6" },
  name: { fontSize: 16 },
  sep: { height: 1, backgroundColor: "#eee", marginLeft: 48 },
})

