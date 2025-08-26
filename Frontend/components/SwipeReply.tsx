import React, { useRef } from "react"
import { Animated, PanResponder, View } from "react-native"

interface SwipeReplyProps {
  children: React.ReactNode
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
}

export default function SwipeReply({ children, onSwipeLeft, onSwipeRight }: SwipeReplyProps) {
  const translateX = useRef(new Animated.Value(0)).current
  const threshold = 48

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dy) < 12,
      onPanResponderMove: (_, g) => {
        const clamped = Math.max(-120, Math.min(120, g.dx))
        translateX.setValue(clamped)
      },
      onPanResponderRelease: (_, g) => {
        const dx = g.dx
        const triggerLeft = dx <= -threshold
        const triggerRight = dx >= threshold
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 7, tension: 70 }).start()
        if (triggerLeft && onSwipeLeft) onSwipeLeft()
        if (triggerRight && onSwipeRight) onSwipeRight()
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start()
      },
    }),
  ).current

  return (
    <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
      {children}
    </Animated.View>
  )
}