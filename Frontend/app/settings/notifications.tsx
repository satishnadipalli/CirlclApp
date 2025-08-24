import { useEffect, useState } from 'react'
import { View, Text, Switch, StyleSheet, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import api from '@/services/api.service'

export default function NotificationSettings() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [prefs, setPrefs] = useState<{ like: boolean; comment: boolean; reply: boolean; mention: boolean; follow: boolean; save: boolean; daily: boolean }>({ like: true, comment: true, reply: true, mention: true, follow: true, save: true, daily: true })

  useEffect(() => {
    ;(async () => {
      try {
        const res: any = await api.getNotificationPrefs()
        if (res?.success && res?.prefs) setPrefs({ ...prefs, ...res.prefs })
      } finally { setLoading(false) }
    })()
  }, [])

  const onToggle = (key: keyof typeof prefs) => (val: boolean) => {
    setPrefs((p) => ({ ...p, [key]: val }))
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.updateNotificationPrefs(prefs)
      router.back()
    } finally { setSaving(false) }
  }

  if (loading) return <View style={styles.container}><Text style={styles.title}>Loading…</Text></View>

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.link}>Back</Text></TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <TouchableOpacity onPress={save} disabled={saving}><Text style={[styles.link, saving && { opacity: 0.6 }]}>{saving ? 'Saving…' : 'Save'}</Text></TouchableOpacity>
      </View>
      {([
        ['like','Likes'],
        ['comment','Comments'],
        ['reply','Replies'],
        ['mention','Mentions'],
        ['follow','Follows'],
        ['save','Saves'],
        ['daily','Daily rings'],
      ] as Array<[keyof typeof prefs, string]>).map(([k, label]) => (
        <View key={k} style={styles.row}>
          <Text style={styles.label}>{label}</Text>
          <Switch value={!!prefs[k]} onValueChange={onToggle(k)} />
        </View>
      ))}
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