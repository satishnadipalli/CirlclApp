import React, { useEffect, useState } from "react"
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
    const sec = Math.floor(diffMs / 1000)
    const min = Math.floor(sec / 60)
    const hr = Math.floor(min / 60)
    const day = Math.floor(hr / 24)
    if (sec < 45) return "Last seen just now"
    if (sec < 90) return "Last seen 1m ago"
    if (min < 45) return `Last seen ${min}m ago`
    if (min < 90) return "Last seen 1h ago"
    if (hr < 22) return `Last seen ${hr}h ago`
    if (hr < 36) return "Last seen 1d ago"
    return `Last seen ${day}d ago`
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
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(id)
  }, [])
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