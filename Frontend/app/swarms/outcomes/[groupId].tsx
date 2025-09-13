"use client"

import { apiService } from "@/services/api.service"
import { useLocalSearchParams, useRouter } from "expo-router"
import React, { useEffect, useState } from "react"
import { FlatList, Platform, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native"

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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>{"‹"}</Text></TouchableOpacity>
        <Text style={styles.title}>Swarm Outcomes</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList data={items} keyExtractor={(i) => String(i._id)} contentContainerStyle={{ paddingHorizontal: 16 }} renderItem={({ item }) => (
        <TouchableOpacity onPress={() => router.push({ pathname: '/swarms/[swarmId]', params: { swarmId: String(item._id) } })} style={styles.card}>
          <Text style={styles.prompt} numberOfLines={2}>{item.prompt}</Text>
          <Text style={styles.meta}>Ideas: {item.ideas?.length || 0} • Actions: {item.actions?.length || 0}</Text>
        </TouchableOpacity>
      )} ItemSeparatorComponent={() => <View style={styles.sep} />} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) - 10 : 0 },
  header: { paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { fontSize: 24 },
  title: { fontSize: 18, fontWeight: '700' },
  card: { paddingVertical: 12 },
  prompt: { fontWeight: '700', marginBottom: 4 },
  meta: { color: '#666', fontWeight: '600' },
  sep: { height: 1, backgroundColor: '#eee' },
  loading: { marginTop: 40, textAlign: 'center' },
})

