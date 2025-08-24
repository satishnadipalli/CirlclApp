import React, { useEffect, useRef } from "react"
import { Animated, Image, Text, TouchableOpacity, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"

interface DailyRingProps {
  imageUrl: string
  label: string
  onPress?: () => void
  viewed?: boolean
  loading?: boolean
  isVideo?: boolean
}

export default function DailyRing({ imageUrl, label, onPress, viewed, loading, isVideo }: DailyRingProps) {
  const poster = String(imageUrl || '')
  const spin = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (loading) {
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1200, useNativeDriver: true })).start()
    } else {
      spin.stopAnimation(); spin.setValue(0)
    }
  }, [loading])
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const gradientColors = viewed ? ["#c7c7c7", "#c7c7c7"] : ["#4ea1ff", "#7df3e1", "#6ee7b7"]
  return (
    <TouchableOpacity onPress={onPress} style={{ width: 70, alignItems: "center", marginHorizontal: 6 }} activeOpacity={0.8}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 66, height: 66, borderRadius: 33, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
            <Image source={{ uri: poster }} style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#eee' }} />
            {isVideo && (
              <View style={{ position: 'absolute', width: 60, height: 60, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="play-circle" size={20} color="#fff" />
              </View>
            )}
          </View>
        </LinearGradient>
      </Animated.View>
      <Text numberOfLines={1} style={{ fontSize: 12, color: "#666", marginTop: 6, maxWidth: 70 }}>{label}</Text>
    </TouchableOpacity>
  )
}