import { useEffect, useState } from 'react'
import { View, Text, Switch, StyleSheet, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import api from '@/services/api.service'
import socketService from '@/services/socket.service'

type Privacy = {
  showOnline: boolean
  showLastSeen: boolean
  sendTypingIndicators: boolean
  sendReadReceipts: boolean
  allowDMsFrom: 'everyone'|'followers'|'none'
}

export default function PrivacySettings() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [privacy, setPrivacy] = useState<Privacy>({ showOnline: true, showLastSeen: true, sendTypingIndicators: true, sendReadReceipts: true, allowDMsFrom: 'everyone' })

  useEffect(() => {
    ;(async () => {
      try {
        const res: any = await api.getPrivacy()
        if (res?.success && res?.privacy) setPrivacy({ ...privacy, ...res.privacy })
      } finally { setLoading(false) }
    })()
  }, [])

  const onToggle = (key: keyof Privacy) => (val: boolean) => {
    setPrivacy((p) => ({ ...p, [key]: val }))
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.updatePrivacy(privacy)
      try { socketService.setClientPrivacy({ sendTypingIndicators: privacy.sendTypingIndicators }) } catch {}
      // Optimistically refresh presence list on chats tab by firing a lightweight fetch
      try { await (await import('@/services/api.service')).apiService.getOnlineUsers() } catch {}
      router.back()
    } finally { setSaving(false) }
  }

  if (loading) return <View style={styles.container}><Text style={styles.title}>Loading…</Text></View>

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.link}>Back</Text></TouchableOpacity>
        <Text style={styles.title}>Privacy</Text>
        <TouchableOpacity onPress={save} disabled={saving}><Text style={[styles.link, saving && { opacity: 0.6 }]}>{saving ? 'Saving…' : 'Save'}</Text></TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.row, { backgroundColor: '#F7F8FA' }]} onPress={() => router.push('/settings/theme')}>
        <Text style={[styles.label, { fontWeight: '800' }]}>Appearance</Text>
        <Text style={styles.link}>Theme ›</Text>
      </TouchableOpacity>

      <View style={styles.row}><Text style={styles.label}>Show online status</Text><Switch value={privacy.showOnline} onValueChange={onToggle('showOnline')} /></View>
      <View style={styles.row}><Text style={styles.label}>Show last seen</Text><Switch value={privacy.showLastSeen} onValueChange={onToggle('showLastSeen')} /></View>
      <View style={styles.row}><Text style={styles.label}>Send typing indicators</Text><Switch value={privacy.sendTypingIndicators} onValueChange={onToggle('sendTypingIndicators')} /></View>
      <View style={styles.row}><Text style={styles.label}>Send read receipts</Text><Switch value={privacy.sendReadReceipts} onValueChange={onToggle('sendReadReceipts')} /></View>

      <View style={styles.row}>
        <Text style={styles.label}>Allow DMs from</Text>
        <TouchableOpacity onPress={() => {
          setPrivacy((p) => {
            const order: Array<'everyone'|'followers'|'none'> = ['everyone','followers','none']
            const idx = order.indexOf(p.allowDMsFrom)
            const next = order[(idx + 1) % order.length]
            return { ...p, allowDMsFrom: next }
          })
        }}>
          <Text style={styles.link}>
            {privacy.allowDMsFrom === 'everyone' ? 'Everyone' : privacy.allowDMsFrom === 'followers' ? 'Followers only' : 'No one'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 50 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  title: { fontSize: 18, fontWeight: '800', color: '#000' },
  link: { color: '#007aff', fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f3f3' },
  label: { color: '#000', fontSize: 16 },
})

