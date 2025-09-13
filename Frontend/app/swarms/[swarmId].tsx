"use client"

import { apiService } from "@/services/api.service"
import socketService from "@/services/socket.service"
import { useLocalSearchParams, useRouter } from "expo-router"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { Alert, FlatList, KeyboardAvoidingView, Platform, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native"

interface Idea { _id: string; author: string; text: string; votes: number }
interface Cluster { _id?: string; title: string; ideaIds: string[] }
interface ActionItem { _id?: string; text: string; owner?: string; dueAt?: string }

export default function SwarmLiveScreen() {
  const { swarmId } = useLocalSearchParams<{ swarmId: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [swarm, setSwarm] = useState<any>(null)
  const [ideaText, setIdeaText] = useState("")
  const [phase, setPhase] = useState<string>("lobby")

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const r: any = await apiService.getSwarm(String(swarmId))
        if (r?.success) {
          if (!mounted) return
          setSwarm(r.swarm)
          setPhase(r.swarm?.lastPhase || r.swarm?.status || 'lobby')
          try { socketService.joinSwarm(String(swarmId)) } catch {}
          try { await apiService.joinSwarm(String(swarmId)) } catch {}
        } else {
          Alert.alert('Not found', r?.message || 'Swarm not found')
          router.back()
        }
      } catch (e) {
        Alert.alert('Error', (e as Error).message)
        router.back()
      } finally { setLoading(false) }
    })()

    const onIdea = (payload: any) => {
      if (String(payload?.swarmId) !== String(swarmId)) return
      setSwarm((prev: any) => ({ ...(prev || {}), ideas: ([...(prev?.ideas || []), payload.idea]) }))
    }
    const onPhase = (payload: any) => {
      if (String(payload?.swarmId) !== String(swarmId)) return
      setPhase(String(payload?.phase || 'lobby'))
    }
    const onVotes = (payload: any) => {
      if (String(payload?.swarmId) !== String(swarmId)) return
      setSwarm((prev: any) => {
        const list = (prev?.ideas || []).map((it: any) => String(it._id) === String(payload.ideaId) ? { ...it, votes: payload.votes } : it)
        return { ...(prev || {}), ideas: list }
      })
    }
    const onEnded = (payload: any) => {
      if (String(payload?.swarmId) !== String(swarmId)) return
      Alert.alert('Swarm ended', 'Session ended by host')
      setPhase('ended')
    }
    const onClusters = (p: any) => {
      if (String(p?.swarmId) !== String(swarmId)) return
      setSwarm((prev: any) => ({ ...(prev || {}), clusters: p.clusters || [] }))
      setPhase('cluster')
    }
    const onActions = (p: any) => {
      if (String(p?.swarmId) !== String(swarmId)) return
      setSwarm((prev: any) => ({ ...(prev || {}), actions: p.actions || [] }))
      setPhase('converge')
    }

    socketService.onSwarmIdea(onIdea)
    socketService.onSwarmPhase(onPhase)
    socketService.onSwarmVotes(onVotes)
    socketService.onSwarmClusters(onClusters)
    socketService.onSwarmActions(onActions)
    socketService.onSwarmEnded(onEnded)

    return () => {
      socketService.removeSwarmIdea(onIdea)
      socketService.removeSwarmPhase(onPhase)
      socketService.removeSwarmVotes(onVotes)
      socketService.removeSwarmClusters(onClusters)
      socketService.removeSwarmActions(onActions)
      socketService.removeSwarmEnded(onEnded)
      try { socketService.leaveSwarm(String(swarmId)) } catch {}
    }
  }, [swarmId])

  const ideas: Idea[] = useMemo(() => (swarm?.ideas || []) as any, [swarm])

  const sendIdea = async () => {
    const t = ideaText.trim()
    if (t.length < 2) return
    const r: any = await apiService.addIdea(String(swarmId), t)
    if (!(r?.success)) Alert.alert('Failed', r?.message || 'Could not add idea')
    setIdeaText("")
  }

  const vote = async (ideaId: string) => {
    const r: any = await apiService.voteIdea(String(swarmId), ideaId)
    if (!(r?.success)) Alert.alert('Failed', r?.message || 'Already voted?')
  }

  const startIfHost = async () => {
    const r: any = await apiService.startSwarm(String(swarmId))
    if (!(r?.success)) Alert.alert('Start failed', r?.message || 'Not allowed')
  }

  const endIfHost = async () => {
    const r: any = await apiService.endSwarm(String(swarmId))
    if (!(r?.success)) Alert.alert('End failed', r?.message || 'Not allowed')
  }

  if (loading || !swarm) return <View style={styles.container}><Text style={styles.loading}>Loading…</Text></View>

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>{"‹"}</Text></TouchableOpacity>
        <Text style={styles.title}>Swarm</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.promptBox}>
        <Text style={styles.prompt}>{swarm?.prompt}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {phase === 'lobby' && <TouchableOpacity onPress={startIfHost}><Text style={styles.primary}>Start</Text></TouchableOpacity>}
          <Text style={styles.phase}>Phase: {phase}</Text>
        </View>
      </View>

      <FlatList
        data={ideas}
        keyExtractor={(i) => i._id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        renderItem={({ item }) => (
          <View style={styles.ideaRow}>
            <Text style={styles.ideaText}>{item.text}</Text>
            <TouchableOpacity onPress={() => vote(item._id)}><Text style={styles.voteBtn}>▲ {item.votes || 0}</Text></TouchableOpacity>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />

      <View style={styles.inputBar}>
        <TextInput value={ideaText} onChangeText={setIdeaText} placeholder="Add an idea…" placeholderTextColor="#999" style={styles.input} />
        <TouchableOpacity onPress={sendIdea}><Text style={styles.send}>Send</Text></TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) - 10 : 0 },
  header: { paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { fontSize: 24 },
  title: { fontSize: 18, fontWeight: '700' },
  actionDanger: { color: '#f33', fontSize: 14, fontWeight: '700' },
  promptBox: { backgroundColor: '#f7f7f7', margin: 16, padding: 12, borderRadius: 12 },
  prompt: { fontWeight: '700', marginBottom: 6 },
  phase: { color: '#555', fontWeight: '600' },
  ideaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ideaText: { flex: 1, fontSize: 14, fontWeight: '600', marginRight: 10 },
  voteBtn: { color: '#0095f6', fontWeight: '800' },
  sep: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
  inputBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  input: { flex: 1, height: 40, borderWidth: 1, borderColor: '#eee', borderRadius: 10, paddingHorizontal: 10, color: '#000' },
  send: { marginLeft: 10, color: '#0095f6', fontWeight: '800' },
  loading: { marginTop: 40, textAlign: 'center' },
})

