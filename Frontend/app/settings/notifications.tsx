import React from "react"
import { View, Text, TouchableOpacity } from "react-native"
import { useRouter } from "expo-router"

export default function NotificationsSettings() {
  const router = useRouter()
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: 50 }}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <Text style={{ fontWeight: '800', fontSize: 18 }}>Settings</Text>
      </View>
      <TouchableOpacity onPress={() => router.push('/settings/blocked')} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text style={{ fontWeight: '700' }}>Blocked users</Text>
        <Text style={{ color: '#666' }}>Manage who you’ve blocked</Text>
      </TouchableOpacity>
    </View>
  )
}