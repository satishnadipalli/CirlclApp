import React from "react"
import { View, Text } from "react-native"

interface PresenceBadgeProps {
  isOnline?: boolean
  lastSeen?: string | Date | null
  colorOnline?: string
  colorOffline?: string
  size?: "sm" | "md"
  customStatus?: { text?: string; emoji?: string } | null
}

function formatLastSeen(iso?: string | Date | null): string {
  if (!iso) return "Offline"
  try {
    const d = typeof iso === "string" ? new Date(iso) : iso
    const now = Date.now()
    const diffMs = Math.max(0, now - (d?.getTime?.() || 0))
    const mins = Math.floor(diffMs / 60000)
    if (mins < 1) return "Last seen just now"
    if (mins < 60) return `Last seen ${mins}m ago`
    if (mins < 60 * 24) return `Last seen ${Math.floor(mins / 60)}h ago`
    return `Last seen ${Math.floor(mins / (60 * 24))}d ago`
  } catch {
    return "Offline"
  }
}

export const PresenceBadge: React.FC<PresenceBadgeProps> = ({
  isOnline,
  lastSeen,
  colorOnline = "#4CAF50",
  colorOffline = "#666",
  size = "md",
  customStatus,
}) => {
  const textStyle = size === "sm" ? { fontSize: 12 } : { fontSize: 14 }
  if (isOnline) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colorOnline, marginRight: 6 }} />
        <Text style={[{ color: colorOnline, fontWeight: "700" }, textStyle]}>
          {customStatus?.emoji ? `${customStatus.emoji} ` : ''}
          {customStatus?.text ? customStatus.text : 'Online'}
        </Text>
      </View>
    )
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colorOffline, marginRight: 6 }} />
      <Text style={[{ color: colorOffline }, textStyle]}>{formatLastSeen(lastSeen || null)}</Text>
    </View>
  )
}

export default PresenceBadge