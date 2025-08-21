import React from "react"
import { Image, Text, TouchableOpacity, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"

interface DailyRingProps {
  imageUrl: string
  label: string
  onPress?: () => void
}

export default function DailyRing({ imageUrl, label, onPress }: DailyRingProps) {
  return (
    <TouchableOpacity onPress={onPress} style={{ width: 70, alignItems: "center", marginHorizontal: 6 }} activeOpacity={0.8}>
      <LinearGradient colors={["#DE0046", "#F7A34B"]} style={{ width: 66, height: 66, borderRadius: 33, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
          <Image source={{ uri: imageUrl }} style={{ width: 60, height: 60, borderRadius: 30 }} />
        </View>
      </LinearGradient>
      <Text numberOfLines={1} style={{ fontSize: 12, color: "#666", marginTop: 6, maxWidth: 70 }}>{label}</Text>
    </TouchableOpacity>
  )
}