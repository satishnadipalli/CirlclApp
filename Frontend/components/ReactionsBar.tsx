import React, { useEffect, useRef } from "react"
import { Animated, Easing, TouchableOpacity, View, Text, Dimensions } from "react-native"

interface ReactionsBarProps {
  x: number
  y: number
  onSelect: (emoji: string) => void
  onClose: () => void
  emojis?: string[]
}

const DEFAULT_EMOJIS = ['❤️','👍','😂','😮','😢','🔥']

export default function ReactionsBar({ x, y, onSelect, onClose, emojis = DEFAULT_EMOJIS }: ReactionsBarProps) {
  const scale = useRef(new Animated.Value(0.8)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 140, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 140, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start()
    return () => {}
  }, [])

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window')
  // Bubble size estimate
  const barWidth = Math.min(300, Math.max(200, (emojis?.length || 6) * 40))
  const barHeight = 52
  // Clamp horizontally
  const left = Math.max(8, Math.min(x - Math.round(barWidth / 2), screenWidth - barWidth - 8))
  // Prefer above the press point, flip below if near top
  const margin = 10
  const preferTop = y - barHeight - margin > 24
  const computedTop = preferTop ? (y - barHeight - margin) : (y + margin)
  // Clamp vertically inside screen
  const top = Math.max(24, Math.min(computedTop, screenHeight - barHeight - 24))

  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 9999 }}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} />
      <Animated.View style={{ position: 'absolute', transform: [{ scale }], opacity, top, left }}>
        <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, elevation: 4, borderWidth: 1, borderColor: '#e9e9e9', width: barWidth, justifyContent: 'space-between' }}>
          {emojis.map((emoji) => (
            <TouchableOpacity key={emoji} onPress={() => onSelect(emoji)} style={{ paddingHorizontal: 8 }}>
              <Text style={{ fontSize: 22 }}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </View>
  )
}