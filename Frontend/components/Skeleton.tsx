import React, { useEffect, useRef } from 'react'
import { Animated, ViewStyle } from 'react-native'

export default function Skeleton({ height = 16, width = '100%', radius = 8, style }: { height?: number; width?: number|string; radius?: number; style?: ViewStyle }) {
  const shimmer = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = () => Animated.timing(shimmer, { toValue: 1, duration: 1200, useNativeDriver: false }).start(() => { shimmer.setValue(0); loop() })
    loop()
    return () => { try { shimmer.stopAnimation() } catch {} }
  }, [shimmer])
  const bg = shimmer.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['#ECEFF4', '#E2E8F0', '#ECEFF4'] })
  return <Animated.View style={[{ height, width, borderRadius: radius, backgroundColor: bg }, style]} />
}

