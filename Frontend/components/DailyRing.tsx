import React from "react"
import { Image, Text, TouchableOpacity, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"

interface DailyRingProps {
  imageUrl: string
  label: string
  onPress?: () => void
}

export default function DailyRing({ imageUrl, label, onPress }: DailyRingProps) {
  const isVideo = /\.(mp4|mov|m4v|webm)$/i.test(String(imageUrl || ''))
  const poster = String(imageUrl || '')
  return (
    <TouchableOpacity onPress={onPress} style={{ width: 70, alignItems: "center", marginHorizontal: 6 }} activeOpacity={0.8}>
      <LinearGradient colors={["#DE0046", "#F7A34B"]} style={{ width: 66, height: 66, borderRadius: 33, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
          <Image source={{ uri: poster }} style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#eee' }} />
          {isVideo && (
            <View style={{ position: 'absolute', width: 60, height: 60, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="play-circle" size={20} color="#fff" />
            </View>
          )}
        </View>
      </LinearGradient>
      <Text numberOfLines={1} style={{ fontSize: 12, color: "#666", marginTop: 6, maxWidth: 70 }}>{label}</Text>
    </TouchableOpacity>
  )
}