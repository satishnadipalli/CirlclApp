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
  size?: number
}

export default function DailyRing({ imageUrl, label, onPress, viewed, loading, isVideo, size = 90 }: DailyRingProps) {
  const poster = String(imageUrl || '')
  const spin = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (loading) {
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1200, useNativeDriver: true })).start()
    } else {
      spin.stopAnimation(); spin.setValue(0)
    }
  }, [loading])
  const rotateOuter = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const rotateInner = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] })
  const gradientColors = viewed ? ["#dfdfdfff", "#ebebebff"] : ["#f58529", "#dd2a7b", "#8134af", "#515bd4"]
  const outer = size - 9
  const middle = size - 14
  const inner = size - 20
  return (
    <TouchableOpacity onPress={onPress} style={{ width: outer + 8, alignItems: "center", marginHorizontal: 6 }} activeOpacity={0.8}>
      <Animated.View style={{ transform: [{ rotate: loading ? rotateOuter : '0deg' }] }}>
        <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: outer, height: outer, borderRadius: outer / 2, alignItems: "center", justifyContent: "center" }}>
          <Animated.View style={{ width: middle, height: middle, borderRadius: middle / 2, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", transform: [{ rotate: loading ? rotateInner : '0deg' }] }}>
            <Image source={{ uri: poster }} style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: '#eee' }} />
            {isVideo && (
              <View style={{ position: 'absolute', width: inner, height: inner, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="play-circle" size={24} color="#fff" />
              </View>
            )}
          </Animated.View>
        </LinearGradient>
      </Animated.View>
      <Text numberOfLines={1} style={{ fontSize: 12, color: "#666", marginTop: 6, maxWidth: outer + 8 }}>{label}</Text>
    </TouchableOpacity>
  )
}