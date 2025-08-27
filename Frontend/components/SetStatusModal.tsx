import React, { useState } from 'react'
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native'

interface SetStatusModalProps {
  visible: boolean
  initialText?: string
  initialEmoji?: string
  onClose: () => void
  onSave: (text: string, emoji?: string, durationMinutes?: number) => Promise<void> | void
}

const emojiOptions = ['💼','✈️','☕','🎮','🎧','💤','🏋️','📚','🧘','🌴']
const durationPresets = [30, 60, 120, 240]

export default function SetStatusModal({ visible, initialText = '', initialEmoji = '', onClose, onSave }: SetStatusModalProps) {
  const [text, setText] = useState(initialText)
  const [emoji, setEmoji] = useState(initialEmoji)
  const [duration, setDuration] = useState<number>(60)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try { await onSave(text, emoji, duration); onClose() } finally { setSaving(false) }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Set a status</Text>
          <View style={styles.row}>
            <View style={styles.emojiPicker}>
              <Text style={styles.label}>Emoji</Text>
              <View style={styles.emojiRow}>
                {emojiOptions.map((e) => (
                  <TouchableOpacity key={e} onPress={() => setEmoji(e)} style={[styles.emojiBtn, emoji === e && styles.emojiBtnActive]}>
                    <Text style={styles.emojiText}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
          <View style={{ marginTop: 10 }}>
            <Text style={styles.label}>Text</Text>
            <TextInput value={text} onChangeText={setText} placeholder="What are you up to?" placeholderTextColor="#888" style={styles.input} maxLength={60} />
          </View>
          <View style={{ marginTop: 12 }}>
            <Text style={styles.label}>Duration</Text>
            <View style={styles.durationRow}>
              {durationPresets.map((m) => (
                <TouchableOpacity key={m} onPress={() => setDuration(m)} style={[styles.durationChip, duration === m && styles.durationChipActive]}>
                  <Text style={[styles.durationText, duration === m && styles.durationTextActive]}>{m}m</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={[styles.btn, { backgroundColor: '#eee' }]}><Text style={[styles.btnText, { color: '#333' }]}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity disabled={saving} onPress={handleSave} style={[styles.btn, { backgroundColor: '#111' }]}>
              <Text style={[styles.btnText, { color: '#fff' }]}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  title: { fontSize: 18, fontWeight: '800', color: '#000' },
  row: { marginTop: 10 },
  emojiPicker: {},
  label: { color: '#555', fontWeight: '700', marginBottom: 6 },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiBtn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#f4f4f4' },
  emojiBtnActive: { backgroundColor: '#e6f0ff' },
  emojiText: { fontSize: 20 },
  input: { height: 44, borderWidth: 1, borderColor: '#eee', borderRadius: 10, paddingHorizontal: 12, color: '#000' },
  durationRow: { flexDirection: 'row', gap: 8 },
  durationChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: '#f4f4f4' },
  durationChipActive: { backgroundColor: '#111' },
  durationText: { color: '#333', fontWeight: '700' },
  durationTextActive: { color: '#fff' },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 14 },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  btnText: { fontWeight: '800' },
})

