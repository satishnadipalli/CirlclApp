"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"
import * as ImagePicker from "expo-image-picker"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useRouter } from "expo-router"
import api from "@/services/api.service"

export default function EditProfileScreen() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [username, setUsername] = useState("")
  const [bio, setBio] = useState("")
  const [website, setWebsite] = useState("")
  const [currentAvatar, setCurrentAvatar] = useState<string>("")
  const [pickedUri, setPickedUri] = useState<string | null>(null)
  const [aspect, setAspect] = useState<"1:1" | "4:5" | "16:9">("1:1")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const me: any = await api.getMe()
        const u = (me && (me.user || me)) || {}
        setName(u.name || "")
        setUsername(u.username || "")
        setBio(u.bio || "")
        setWebsite(u.website || "")
        setCurrentAvatar(u.profilePic || "")
      } catch {}
    })()
  }, [])

  const pickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) return

      const aspectPair = aspect === "1:1" ? [1, 1] : aspect === "4:5" ? [4, 5] : [16, 9]
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: aspectPair as any,
        quality: 0.9,
      })
      if (res.canceled) return
      const uri = res.assets?.[0]?.uri
      if (uri) setPickedUri(uri)
    } catch (e) {
      Alert.alert("Error", "Failed to pick image")
    }
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      let avatarUrl: string | undefined
      if (pickedUri) {
        const up: any = await api.uploadProfilePicture(pickedUri)
        if (!up?.success) throw new Error(up?.message || "Upload failed")
        avatarUrl = up?.user?.profilePic
      }

      const payload: any = { name: name.trim(), bio: bio.trim(), website: website.trim() }
      if (username.trim()) payload.username = username.trim()
      if (avatarUrl) payload.profilePic = avatarUrl

      const r: any = await api.updateProfile(payload)
      if (r?.success) {
        try {
          const prev = await AsyncStorage.getItem("user")
          const parsed = prev ? JSON.parse(prev) : {}
          const merged = { ...parsed, name: name.trim(), username: username.trim(), bio: bio.trim(), website: website.trim(), profilePic: avatarUrl || parsed.profilePic }
          await AsyncStorage.setItem("user", JSON.stringify(merged))
        } catch {}
        Alert.alert("Saved", "Profile updated", [{ text: "OK", onPress: () => router.back() }])
      } else {
        throw new Error(r?.message || "Failed to update")
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not update profile")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.link}>Cancel</Text></TouchableOpacity>
        <Text style={styles.title}>Edit profile</Text>
        <TouchableOpacity onPress={save} disabled={saving}><Text style={[styles.link, saving && { opacity: 0.5 }]}>Save</Text></TouchableOpacity>
      </View>

      <View style={styles.avatarRow}>
        <Image source={{ uri: pickedUri || currentAvatar || "https://i.pravatar.cc/150?img=20" }} style={styles.avatar} />
        <View style={{ marginLeft: 12 }}>
          <TouchableOpacity onPress={pickImage}><Text style={styles.link}>Change photo</Text></TouchableOpacity>
          <View style={styles.aspectRow}>
            <TouchableOpacity onPress={() => setAspect("1:1")} style={[styles.aspectBtn, aspect === "1:1" && styles.aspectActive]}><Text style={styles.aspectText}>1:1</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setAspect("4:5")} style={[styles.aspectBtn, aspect === "4:5" && styles.aspectActive]}><Text style={styles.aspectText}>4:5</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setAspect("16:9")} style={[styles.aspectBtn, aspect === "16:9" && styles.aspectActive]}><Text style={styles.aspectText}>16:9</Text></TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Name</Text>
        <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Your name" />
      </View>
      <View style={styles.formGroup}>
        <Text style={styles.label}>Username</Text>
        <TextInput value={username} onChangeText={setUsername} autoCapitalize="none" style={styles.input} placeholder="your.handle" />
        <Text style={{ color: '#777', marginTop: 4, fontSize: 12 }}>3-30 chars; letters, numbers, dot, underscore, hyphen</Text>
      </View>
      <View style={styles.formGroup}>
        <Text style={styles.label}>Bio</Text>
        <TextInput value={bio} onChangeText={setBio} style={[styles.input, styles.multiline]} placeholder="Write a short bio" multiline numberOfLines={3} />
      </View>
      <View style={styles.formGroup}>
        <Text style={styles.label}>Website</Text>
        <TextInput value={website} onChangeText={setWebsite} style={styles.input} placeholder="https://example.com" autoCapitalize="none" />
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 18, fontWeight: "600" },
  link: { color: "#007AFF", fontSize: 16 },
  avatarRow: { flexDirection: "row", alignItems: "center", marginVertical: 16 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: "#eee" },
  aspectRow: { flexDirection: "row", marginTop: 8 },
  aspectBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: "#ddd", marginRight: 8 },
  aspectActive: { borderColor: "#007AFF", backgroundColor: "#EAF2FF" },
  aspectText: { fontSize: 12, color: "#333" },
  formGroup: { marginBottom: 12 },
  label: { fontSize: 14, color: "#666", marginBottom: 6 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#fff" },
  multiline: { height: 90, textAlignVertical: "top" },
})