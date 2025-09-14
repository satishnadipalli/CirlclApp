import React, { useEffect, useState } from "react"
import { View, Text, TouchableOpacity, Switch, StyleSheet, FlatList } from "react-native"
import { useRouter } from "expo-router"
import { apiService } from "@/services/api.service"

export default function NotificationsSettings() {
  const router = useRouter()
  const [prefs, setPrefs] = useState<any>({ like: true, comment: true, reply: true, mention: true, follow: true, save: true, daily: true })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { (async () => { try { const r: any = await apiService.getNotificationPrefs(); if (r?.success && r?.prefs) setPrefs({ ...prefs, ...r.prefs }) } finally { setLoading(false) } })() }, [])
  const onToggle = (k: string) => (v: boolean) => setPrefs((p: any) => ({ ...p, [k]: v }))
  const save = async () => { setSaving(true); try { await apiService.updateNotificationPrefs(prefs) } finally { setSaving(false) } }

  if (loading) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text>Loading…</Text></View>

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: 50 }}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: '800', fontSize: 18 }}>Settings</Text>
        <TouchableOpacity onPress={save} disabled={saving}><Text style={{ color: '#007aff', fontWeight: '800' }}>{saving ? 'Saving…' : 'Save'}</Text></TouchableOpacity>
      </View>

      <View style={styles.row}><Text style={styles.label}>Likes</Text><Switch value={!!prefs.like} onValueChange={onToggle('like')} /></View>
      <View style={styles.row}><Text style={styles.label}>Comments</Text><Switch value={!!prefs.comment} onValueChange={onToggle('comment')} /></View>
      <View style={styles.row}><Text style={styles.label}>Replies</Text><Switch value={!!prefs.reply} onValueChange={onToggle('reply')} /></View>
      <View style={styles.row}><Text style={styles.label}>Mentions</Text><Switch value={!!prefs.mention} onValueChange={onToggle('mention')} /></View>
      <View style={styles.row}><Text style={styles.label}>Follows</Text><Switch value={!!prefs.follow} onValueChange={onToggle('follow')} /></View>
      <View style={styles.row}><Text style={styles.label}>Saves</Text><Switch value={!!prefs.save} onValueChange={onToggle('save')} /></View>
      <View style={styles.row}><Text style={styles.label}>Daily Circle</Text><Switch value={!!prefs.daily} onValueChange={onToggle('daily')} /></View>

      <TouchableOpacity onPress={() => router.push('/settings/blocked')} style={{ paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#f3f3f3' }}>
        <Text style={{ fontWeight: '800' }}>Blocked users</Text>
        <Text style={{ color: '#666' }}>Manage who you’ve blocked</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f3f3' },
  label: { color: '#000', fontSize: 16 },
})