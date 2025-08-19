"use client"

import React from "react"
import { Text, View, StyleSheet, TouchableOpacity } from "react-native"
import { useRouter } from "expo-router"

export default function ChatsTabPlaceholder() {
  const router = useRouter()
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chats</Text>
      <TouchableOpacity onPress={() => router.push("/groups")}> 
        <Text style={styles.link}>Open Groups</Text>
      </TouchableOpacity>
      <Text style={styles.note}>This placeholder is shown because the chats screen file was empty. I will restore the full chats list shortly.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", paddingTop: 50 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  link: { color: "#0095f6", fontWeight: "700", marginTop: 4 },
  note: { color: "#777", fontSize: 12, marginTop: 10, textAlign: "center", paddingHorizontal: 32 },
})

