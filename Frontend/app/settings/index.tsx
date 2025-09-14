import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, FlatList, Image, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { apiService } from '@/services/api.service'

export default function SettingsIndex() {
  const router = useRouter()
  const [requests, setRequests] = useState<Array<{ _id: string; name: string; username?: string; profilePic?: string }>>([])

  useEffect(() => { (async () => { try { const r: any = await apiService.getFollowRequests(); if (r?.success && r?.users) setRequests(r.users) } catch {} })() }, [])

  const accept = async (id: string) => { try { await apiService.acceptFollowRequest(id); setRequests((prev) => prev.filter((u) => u._id !== id)) } catch {} }
  const decline = async (id: string) => { try { await apiService.declineFollowRequest(id); setRequests((prev) => prev.filter((u) => u._id !== id)) } catch {} }

  const renderReq = ({ item }) => (
    <View style={styles.reqRow}>
      <Image source={{ uri: item.profilePic || 'https://i.pravatar.cc/100?img=14' }} style={styles.avatar} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.name}</Text>
        {!!item.username && <Text style={styles.username}>@{item.username}</Text>}
      </View>
      <TouchableOpacity onPress={() => accept(item._id)} style={[styles.btn, styles.accept]}><Text style={styles.btnText}>Accept</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => decline(item._id)} style={[styles.btn, styles.decline]}><Text style={styles.btnText}>Decline</Text></TouchableOpacity>
    </View>
  )

  return (
    <View style={{ flex: 1, paddingTop: 50 }}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' }}>
        <TouchableOpacity onPress={() => router.back()}><Text style={{ color: '#007aff', fontWeight: '700' }}>Back</Text></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '800' }}>Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <TouchableOpacity onPress={() => router.push('/settings/privacy')} style={styles.row}>
        <Text style={styles.rowText}>Privacy</Text>
      </TouchableOpacity>

      <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <Text style={{ fontWeight: '800', marginBottom: 8 }}>Follow requests</Text>
        <FlatList data={requests} keyExtractor={(u) => u._id} renderItem={renderReq} ListEmptyComponent={<Text style={{ color: '#666' }}>No requests</Text>} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f3f3' },
  rowText: { fontSize: 16, fontWeight: '700' },
  reqRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#eee' },
  name: { fontSize: 14, fontWeight: '700' },
  username: { fontSize: 12, color: '#666' },
  btn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, marginLeft: 6 },
  accept: { backgroundColor: '#0095f6' },
  decline: { backgroundColor: '#888' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
})

