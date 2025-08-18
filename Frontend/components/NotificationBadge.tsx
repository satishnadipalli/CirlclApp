import type React from "react"
import { StyleSheet, Text, View } from "react-native"
import { useNotification } from "../contexts/NotificationContext"

export const NotificationBadge: React.FC = () => {
  const { unreadCount } = useNotification()

  if (unreadCount === 0) return null

  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: "#FF3040",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
  },
  badgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
})
