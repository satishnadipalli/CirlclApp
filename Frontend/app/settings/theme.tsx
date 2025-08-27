"use client"

import React, { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { useTheme } from '@/contexts/ThemeContext'

export default function ThemeSettingsScreen() {
  const { mode, schedule, setMode, setSchedule, colors } = useTheme() as any
  const [localMode, setLocalMode] = useState(mode)
  const [darkStart, setDarkStart] = useState(schedule.darkStart)
  const [lightStart, setLightStart] = useState(schedule.lightStart)

  useEffect(() => { setLocalMode(mode); setDarkStart(schedule.darkStart); setLightStart(schedule.lightStart) }, [mode, schedule])

  const save = async () => {
    try {
      if (!/^\d{2}:\d{2}$/.test(darkStart) || !/^\d{2}:\d{2}$/.test(lightStart)) {
        Alert.alert('Invalid time', 'Use 24h HH:mm format (e.g., 19:00)')
        return
      }
      await setMode(localMode)
      await setSchedule({ darkStart, lightStart })
      Alert.alert('Theme', 'Saved')
    } catch {}
  }

  const Radio = ({ value, label }: { value: string; label: string }) => (
    <TouchableOpacity onPress={() => setLocalMode(value)} style={styles.row}>
      <View style={[styles.radio, { borderColor: colors.border }]}>
        {localMode === value && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
      </View>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </TouchableOpacity>
  )

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.container, { backgroundColor: colors.background, paddingTop: 50 }]}>
      <View style={styles.header}> 
        <Text style={[styles.title, { color: colors.text }]}>Appearance</Text>
      </View>
      <View style={{ paddingHorizontal: 16 }}>
        <Radio value="system" label="Use system setting" />
        <Radio value="light" label="Light" />
        <Radio value="dark" label="Dark" />
        <Radio value="scheduled" label="Scheduled" />

        {localMode === 'scheduled' && (
          <View style={{ marginTop: 12 }}>
            <Text style={[styles.section, { color: colors.muted }]}>Schedule (24h)</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.muted }]}>Dark start</Text>
                <TextInput value={darkStart} onChangeText={setDarkStart} placeholder="19:00" placeholderTextColor={colors.muted} style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.muted }]}>Light start</Text>
                <TextInput value={lightStart} onChangeText={setLightStart} placeholder="07:00" placeholderTextColor={colors.muted} style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]} />
              </View>
            </View>
          </View>
        )}

        <TouchableOpacity onPress={save} style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
          <Text style={styles.saveText}>Save</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 20, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  label: { fontSize: 16 },
  section: { marginTop: 12, fontWeight: '700' },
  inputLabel: { fontSize: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, marginTop: 6 },
  saveBtn: { marginTop: 20, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '800' }
})

