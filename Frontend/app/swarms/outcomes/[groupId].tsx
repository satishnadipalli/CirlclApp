"use client"

import { apiService } from "@/services/api.service"
import { useLocalSearchParams, useRouter } from "expo-router"
import React, { useEffect, useState } from "react"
import { FlatList, Platform, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"

export default function SwarmOutcomesScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>()
  const router = useRouter()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    (async () => {
      try {
        const r: any = await apiService.listGroupOutcomes(String(groupId))
        if (r?.success) setItems(r.swarms || [])
      } finally { setLoading(false) }
    })()
  }, [groupId])

  if (loading) return <View style={styles.container}><Text style={styles.loading}>Loading…</Text></View>
  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0f172a", "#1e293b"]} start={[0,0]} end={[1,1]} style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>{"‹"}</Text></TouchableOpacity>
        <Text style={[styles.title, { color: '#fff' }]}>Swarm Outcomes</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <FlatList data={items} keyExtractor={(i) => String(i._id)} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }} renderItem={({ item }) => (
        <TouchableOpacity onPress={() => router.push({ pathname: '/swarms/[swarmId]', params: { swarmId: String(item._id) } })} style={styles.card}>
          <Text style={styles.prompt} numberOfLines={2}>{item.prompt}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'center' }}>
            <Text style={styles.badge}>Ideas {item.ideas?.length || 0}</Text>
            <Text style={styles.badgeAlt}>Actions {item.actions?.length || 0}</Text>
            <Text style={styles.meta}>{new Date(item.updatedAt || item.createdAt).toLocaleDateString()}</Text>
          </View>
        </TouchableOpacity>
      )} ItemSeparatorComponent={() => <View style={styles.sep} />} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) - 10 : 0 },
  headerBar: { paddingHorizontal: 16, paddingBottom: 10, paddingTop: 10, flexDirection: 'row', alignItems: 'center' },
  back: { fontSize: 24 },
  title: { fontSize: 18, fontWeight: '800' },
  card: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#eee', backgroundColor: '#fff' },
  prompt: { fontWeight: '700', marginBottom: 4 },
  meta: { color: '#6b7280', fontWeight: '600' },
  badge: { backgroundColor: '#eef2ff', color: '#111827', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontWeight: '800' },
  badgeAlt: { backgroundColor: '#ecfeff', color: '#111827', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontWeight: '800' },
  sep: { height: 1, backgroundColor: '#eee' },
  loading: { marginTop: 40, textAlign: 'center' },
})

