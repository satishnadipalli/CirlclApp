import React, { useEffect, useRef } from "react"
import { Animated, Easing, TouchableOpacity, View, Text } from "react-native"

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

  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} />
      <Animated.View style={{ position: 'absolute', transform: [{ scale }], opacity, top: Math.max(20, y), left: Math.max(8, Math.min(x - 120, (typeof window !== 'undefined' ? (window as any).innerWidth : 360) - 240)) }}>
        <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 2, borderWidth: 1, borderColor: '#eee' }}>
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