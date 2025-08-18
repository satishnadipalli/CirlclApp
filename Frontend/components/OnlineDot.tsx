import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";

export default function OnlineDot() {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.dot, { transform: [{ scale: scaleAnim }] }]} />
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 10,
    height: 10,
    backgroundColor: "limegreen",
    borderRadius: 5,
  },
});
