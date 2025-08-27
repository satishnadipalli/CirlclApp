import React, { useEffect, useState } from 'react'
import { View, Text, Switch, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import * as Notifications from 'expo-notifications'
import api from '@/services/api.service'

type Prefs = {
  like: boolean
  comment: boolean
  reply: boolean
  mention: boolean
  follow: boolean
  save: boolean
  daily: boolean
  quiet: { enabled: boolean; start: string; end: string }
}

const defaultPrefs: Prefs = {
  like: true,
  comment: true,
  reply: true,
  mention: true,
  follow: true,
  save: true,
  daily: true,
  quiet: { enabled: false, start: '22:00', end: '07:00' },
}

export default function NotificationSettings() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs)

  useEffect(() => {
    ;(async () => {
      try {
        const res: any = await api.getNotificationPrefs()
        if (res?.success && res?.prefs) setPrefs({ ...defaultPrefs, ...res.prefs, quiet: { ...defaultPrefs.quiet, ...(res.prefs.quiet || {}) } })
      } catch (e) {
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const onToggle = (key: keyof Omit<Prefs, 'quiet'>) => (val: boolean) => {
    setPrefs((p) => ({ ...p, [key]: val }))
  }

  const onQuietToggle = (val: boolean) => {
    setPrefs((p) => ({ ...p, quiet: { ...p.quiet, enabled: val } }))
  }

  const cycleTime = (current: string, list: string[]) => {
    const idx = list.indexOf(current)
    const nextIdx = (idx === -1 ? 0 : (idx + 1) % list.length)
    return list[nextIdx]
  }

  const presetStarts = ['21:00','22:00','23:00','00:00']
  const presetEnds = ['06:00','07:00','08:00','09:00']

  const save = async () => {
    setSaving(true)
    try {
      const payload = { like: prefs.like, comment: prefs.comment, reply: prefs.reply, mention: prefs.mention, follow: prefs.follow, save: prefs.save, daily: prefs.daily, quiet: { enabled: !!prefs.quiet?.enabled, start: prefs.quiet?.start || '22:00', end: prefs.quiet?.end || '07:00' } }
      const res: any = await api.updateNotificationPrefs(payload)
      if (res?.success) {
        try {
          // Reschedule daily reminder based on prefs
          if (prefs.daily) {
            try { await Notifications.cancelScheduledNotificationAsync('daily-circle-reminder' as any) } catch {}
            const trigger = { hour: 19, minute: 0, repeats: true } as any
            await Notifications.scheduleNotificationAsync({
              identifier: 'daily-circle-reminder' as any,
              content: { title: 'Daily Circle', body: "Share today's moment with your circle ✨", sound: 'default' },
              trigger,
            })
          } else {
            try { await Notifications.cancelScheduledNotificationAsync('daily-circle-reminder' as any) } catch {}
          }
        } catch {}
        router.back()
      } else {
        Alert.alert('Error', res?.message || 'Failed to save preferences')
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <View style={styles.container}><Text style={styles.title}>Loading…</Text></View>

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.link}>Back</Text></TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <TouchableOpacity onPress={save} disabled={saving}><Text style={[styles.link, saving && { opacity: 0.6 }]}>{saving ? 'Saving…' : 'Save'}</Text></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.section}>Activity</Text>
        <View style={styles.row}><Text style={styles.label}>Likes</Text><Switch value={prefs.like} onValueChange={onToggle('like')} /></View>
        <View style={styles.row}><Text style={styles.label}>Comments</Text><Switch value={prefs.comment} onValueChange={onToggle('comment')} /></View>
        <View style={styles.row}><Text style={styles.label}>Replies</Text><Switch value={prefs.reply} onValueChange={onToggle('reply')} /></View>
        <View style={styles.row}><Text style={styles.label}>Mentions</Text><Switch value={prefs.mention} onValueChange={onToggle('mention')} /></View>
        <View style={styles.row}><Text style={styles.label}>Saves</Text><Switch value={prefs.save} onValueChange={onToggle('save')} /></View>
        <View style={styles.row}><Text style={styles.label}>New followers</Text><Switch value={prefs.follow} onValueChange={onToggle('follow')} /></View>

        <Text style={styles.section}>Daily Circle</Text>
        <View style={styles.row}><Text style={styles.label}>Daily reminder</Text><Switch value={prefs.daily} onValueChange={onToggle('daily')} /></View>

        <Text style={styles.section}>Quiet hours</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Enable quiet hours</Text>
          <Switch value={!!prefs.quiet?.enabled} onValueChange={onQuietToggle} />
        </View>
        <View style={[styles.row, { opacity: prefs.quiet.enabled ? 1 : 0.5 }]}> 
          <Text style={styles.label}>Start</Text>
          <TouchableOpacity disabled={!prefs.quiet.enabled} onPress={() => setPrefs((p) => ({ ...p, quiet: { ...p.quiet, start: cycleTime(p.quiet.start, presetStarts) } }))}>
            <Text style={styles.link}>{prefs.quiet.start}</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.row, { opacity: prefs.quiet.enabled ? 1 : 0.5 }]}> 
          <Text style={styles.label}>End</Text>
          <TouchableOpacity disabled={!prefs.quiet.enabled} onPress={() => setPrefs((p) => ({ ...p, quiet: { ...p.quiet, end: cycleTime(p.quiet.end, presetEnds) } }))}>
            <Text style={styles.link}>{prefs.quiet.end}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  section: { color: '#555', fontSize: 14, fontWeight: '700', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 },
})

import { useEffect, useState } from 'react'
import { View, Text, Switch, StyleSheet, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import api from '@/services/api.service'

export default function NotificationSettings() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [prefs, setPrefs] = useState<{ like: boolean; comment: boolean; reply: boolean; mention: boolean; follow: boolean; save: boolean; daily: boolean; quiet?: { enabled?: boolean; start?: string; end?: string } }>({ like: true, comment: true, reply: true, mention: true, follow: true, save: true, daily: true, quiet: { enabled: false, start: '22:00', end: '07:00' } })

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
      <View style={styles.row}>
        <Text style={styles.label}>Quiet hours</Text>
        <Switch value={!!prefs.quiet?.enabled} onValueChange={(v) => setPrefs((p) => ({ ...p, quiet: { ...(p.quiet || {}), enabled: v } }))} />
      </View>
      {prefs.quiet?.enabled && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ color: '#666', marginBottom: 6 }}>Start (HH:MM)</Text>
          <TouchableOpacity onPress={() => setPrefs((p) => ({ ...p, quiet: { ...(p.quiet || {}), start: p.quiet?.start === '22:00' ? '21:00' : '22:00' } }))}><Text style={styles.link}>{prefs.quiet?.start}</Text></TouchableOpacity>
          <Text style={{ color: '#666', marginVertical: 6 }}>End (HH:MM)</Text>
          <TouchableOpacity onPress={() => setPrefs((p) => ({ ...p, quiet: { ...(p.quiet || {}), end: p.quiet?.end === '07:00' ? '08:00' : '07:00' } }))}><Text style={styles.link}>{prefs.quiet?.end}</Text></TouchableOpacity>
        </View>
      )}
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