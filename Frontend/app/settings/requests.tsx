import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, FlatList, Image, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import api from '@/services/api.service'

export default function FollowRequestsScreen() {
  const router = useRouter()
  const [tab, setTab] = useState<'received'|'sent'>('received')
  const [received, setReceived] = useState<Array<any>>([])
  const [sent, setSent] = useState<Array<any>>([])
  const [accepted, setAccepted] = useState<Record<string, boolean>>({})

  const load = async () => {
    try { const r: any = await (api as any).getFollowRequests(); setReceived(Array.isArray(r?.users) ? r.users : []) } catch { setReceived([]) }
    try { const s: any = await (api as any).getSentFollowRequests(); setSent(Array.isArray(s?.users) ? s.users : []) } catch { setSent([]) }
  }
  useEffect(() => { load() }, [])

  const accept = async (id: string) => { try { await (api as any).acceptFollowRequest(id); setAccepted((prev) => ({ ...prev, [id]: true })) } catch {} }
  const decline = async (id: string) => { try { await (api as any).declineFollowRequest(id); setReceived((prev) => prev.filter((u) => u._id !== id)) } catch {} }
  const cancel = async (id: string) => { try { await (api as any).cancelFollowRequest(id); setSent((prev) => prev.filter((u) => u._id !== id)) } catch {} }
  const followBack = async (id: string) => { try { await (api as any).followUser(id) } catch {} ; setReceived((prev) => prev.filter((u) => u._id !== id)); setAccepted((prev) => { const n = { ...prev }; delete n[id]; return n }) }
  const dismissAccepted = (id: string) => { setReceived((prev) => prev.filter((u) => u._id !== id)); setAccepted((prev) => { const n = { ...prev }; delete n[id]; return n }) }

  const renderRow = ({ item }) => (
    <View style={styles.row}> 
      <Image source={{ uri: item.profilePic || 'https://i.pravatar.cc/100?img=14' }} style={styles.avatar} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.name}</Text>
        {!!item.username && <Text style={styles.username}>@{item.username}</Text>}
      </View>
      {tab === 'received' ? (
        accepted[item._id] ? (
          <>
            <TouchableOpacity onPress={() => followBack(item._id)} style={[styles.btn, styles.accept]}><Text style={styles.btnText}>Follow back</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => dismissAccepted(item._id)} style={[styles.btn, styles.decline]}><Text style={styles.btnText}>Done</Text></TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity onPress={() => accept(item._id)} style={[styles.btn, styles.accept]}><Text style={styles.btnText}>Accept</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => decline(item._id)} style={[styles.btn, styles.decline]}><Text style={styles.btnText}>Decline</Text></TouchableOpacity>
          </>
        )
      ) : (
        <TouchableOpacity onPress={() => cancel(item._id)} style={[styles.btn, styles.decline]}><Text style={styles.btnText}>Cancel</Text></TouchableOpacity>
      )}
    </View>
  )

  const data = tab === 'received' ? received : sent

  return (
    <View style={{ flex: 1, paddingTop: 50 }}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' }}>
        <TouchableOpacity onPress={() => router.back()}><Text style={{ color: '#007aff', fontWeight: '700' }}>Back</Text></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '800' }}>Follow requests</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={{ flexDirection: 'row', margin: 12, backgroundColor: '#f2f2f2', borderRadius: 10, padding: 4 }}>
        <TouchableOpacity onPress={() => setTab('received')} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, backgroundColor: tab === 'received' ? '#fff' : 'transparent' }}>
          <Text style={{ fontWeight: '800', color: tab === 'received' ? '#000' : '#666' }}>Received</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab('sent')} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, backgroundColor: tab === 'sent' ? '#fff' : 'transparent' }}>
          <Text style={{ fontWeight: '800', color: tab === 'sent' ? '#000' : '#666' }}>Sent</Text>
        </TouchableOpacity>
      </View>

      <FlatList data={data} keyExtractor={(u) => u._id} renderItem={renderRow} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }} ListEmptyComponent={<Text style={{ color: '#666', paddingHorizontal: 16 }}>No {tab} requests</Text>} onRefresh={load} refreshing={false} />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#eee' },
  name: { fontSize: 14, fontWeight: '700' },
  username: { fontSize: 12, color: '#666' },
  btn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, marginLeft: 6 },
  accept: { backgroundColor: '#0095f6' },
  decline: { backgroundColor: '#888' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
})

