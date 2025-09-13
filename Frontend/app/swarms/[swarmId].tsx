"use client"

import { apiService } from "@/services/api.service"
import socketService from "@/services/socket.service"
import { useLocalSearchParams, useRouter } from "expo-router"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { Alert, FlatList, KeyboardAvoidingView, Platform, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from "react-native"

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
  const [isHost, setIsHost] = useState<boolean>(false)
  const [endsIn, setEndsIn] = useState<number>(0)
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [newClusterTitle, setNewClusterTitle] = useState("")
  const [selectedForCluster, setSelectedForCluster] = useState<Record<string, boolean>>({})
  const [actionText, setActionText] = useState("")

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const r: any = await apiService.getSwarm(String(swarmId))
        if (r?.success) {
          if (!mounted) return
          setSwarm({ ...(r.swarm || {}), me: r.me })
          setPhase(r.swarm?.lastPhase || r.swarm?.status || 'lobby')
          setIsHost(!!r.isHost)
          setClusters((r?.swarm?.clusters || []) as any)
          try {
            if (r?.swarm?.endsAt) {
              const end = new Date(r.swarm.endsAt).getTime()
              const tick = () => setEndsIn(Math.max(0, Math.floor((end - Date.now()) / 1000)))
              tick()
              const id = setInterval(tick, 1000)
              return () => clearInterval(id)
            }
          } catch {}
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
      setClusters((p?.clusters || []) as any)
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
  const gotoPhase = async (p: 'diverge'|'cluster'|'vote'|'converge') => {
    const r: any = await apiService.setSwarmPhase(String(swarmId), p)
    if (!(r?.success)) Alert.alert('Failed', r?.message || 'Not allowed')
  }

  const addCluster = async () => {
    const title = newClusterTitle.trim()
    const ids = Object.keys(selectedForCluster).filter((k) => selectedForCluster[k])
    if (!isHost) return
    if (!title || ids.length === 0) return
    const next = [...clusters, { title, ideaIds: ids } as Cluster]
    setClusters(next)
    setNewClusterTitle("")
    setSelectedForCluster({})
    const r: any = await apiService.clusterIdeas(String(swarmId), next as any)
    if (!(r?.success)) Alert.alert('Failed', r?.message || 'Could not cluster')
  }

  const setAction = async () => {
    const t = actionText.trim()
    if (!isHost || !t) return
    const payload = [{ text: t }]
    const r: any = await apiService.setActions(String(swarmId), payload)
    if (!(r?.success)) Alert.alert('Failed', r?.message || 'Could not set actions')
    else setActionText("")
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
        {isHost && phase !== 'ended' ? (
          <TouchableOpacity onPress={endIfHost}><Text style={styles.actionDanger}>End</Text></TouchableOpacity>
        ) : <View style={{ width: 40 }} />}
      </View>

      <View style={styles.promptBox}>
        <Text style={styles.prompt}>{swarm?.prompt}</Text>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          {isHost && phase === 'lobby' && <TouchableOpacity onPress={startIfHost}><Text style={styles.primary}>Start</Text></TouchableOpacity>}
          {isHost && phase !== 'lobby' && phase !== 'ended' && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => gotoPhase('diverge')}><Text style={styles.chip}>Diverge</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => gotoPhase('cluster')}><Text style={styles.chip}>Cluster</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => gotoPhase('vote')}><Text style={styles.chip}>Vote</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => gotoPhase('converge')}><Text style={styles.chip}>Converge</Text></TouchableOpacity>
            </View>
          )}
          <Text style={styles.phase}>Phase: {phase}</Text>
          {endsIn > 0 && <Text style={styles.countdown}>{Math.floor(endsIn/60)}:{String(endsIn%60).padStart(2,'0')}</Text>}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}>
        {/* Ideas list */}
        <Text style={{ fontWeight: '800', marginBottom: 6 }}>Ideas</Text>
        {ideas.map((item) => (
          <View key={item._id} style={styles.ideaRow}>
            <TouchableOpacity disabled={!isHost || phase !== 'cluster'} onPress={() => setSelectedForCluster((p) => ({ ...p, [item._id]: !p[item._id] }))}>
              <Text style={[styles.selector, selectedForCluster[item._id] && styles.selectorOn]}>{selectedForCluster[item._id] ? '●' : '○'}</Text>
            </TouchableOpacity>
            <Text style={styles.ideaText}>{item.text}</Text>
            <TouchableOpacity disabled={phase !== 'vote'} onPress={() => vote(item._id)}><Text style={[styles.voteBtn, phase !== 'vote' && { opacity: 0.4 }]}>▲ {item.votes || 0}</Text></TouchableOpacity>
          </View>
        ))}
        <View style={styles.sep} />

        {/* Cluster UI (host only) */}
        {isHost && phase === 'cluster' && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontWeight: '800', marginBottom: 6 }}>Clusters</Text>
            {(clusters || []).map((c, idx) => (
              <Text key={String(idx)} style={{ marginBottom: 4 }}>- {c.title} ({c.ideaIds?.length || 0})</Text>
            ))}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <TextInput value={newClusterTitle} onChangeText={setNewClusterTitle} placeholder="Cluster title" placeholderTextColor="#999" style={[styles.input, { flex: 0.7 }]} />
              <TouchableOpacity onPress={addCluster}><Text style={styles.primary}>Add cluster</Text></TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
              <TouchableOpacity onPress={async () => {
                const r: any = await apiService.suggestSwarmClusters(String(swarmId))
                if (r?.success) setClusters(r.clusters || [])
                else Alert.alert('Failed', r?.message || 'No suggestions')
              }}><Text style={styles.primary}>Suggest clusters</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => gotoPhase('vote')}><Text style={styles.primary}>Open voting</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {/* Converge actions (host) */}
        {isHost && phase === 'converge' && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontWeight: '800', marginBottom: 6 }}>Actions</Text>
            {Array.isArray(swarm?.actions) && (swarm.actions as any[]).map((a: any, i: number) => (
              <Text key={String(i)} style={{ marginBottom: 4 }}>- {a.text}</Text>
            ))}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <TextInput value={actionText} onChangeText={setActionText} placeholder="Add action" placeholderTextColor="#999" style={[styles.input, { flex: 0.7 }]} />
              <TouchableOpacity onPress={setAction}><Text style={styles.primary}>Save</Text></TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
              <TouchableOpacity onPress={async () => {
                const r: any = await apiService.suggestSwarmActions(String(swarmId))
                if (r?.success) {
                  const a = Array.isArray(r.actions) ? r.actions : []
                  const s: any = await apiService.setActions(String(swarmId), a)
                  if (!(s?.success)) Alert.alert('Failed', s?.message || 'Could not save')
                } else Alert.alert('Failed', r?.message || 'No suggestions')
              }}><Text style={styles.primary}>Suggest actions</Text></TouchableOpacity>
              <TouchableOpacity onPress={endIfHost}><Text style={styles.actionDanger}>End session</Text></TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.inputBar}>
        <TextInput value={ideaText} onChangeText={setIdeaText} placeholder="Add an idea…" placeholderTextColor="#999" style={styles.input} editable={phase === 'diverge'} />
        <TouchableOpacity disabled={phase !== 'diverge'} onPress={sendIdea}><Text style={[styles.send, phase !== 'diverge' && { opacity: 0.4 }]}>Send</Text></TouchableOpacity>
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
  chip: { color: '#111', backgroundColor: '#eee', borderRadius: 12, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, fontWeight: '700' },
  ideaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ideaText: { flex: 1, fontSize: 14, fontWeight: '600', marginRight: 10 },
  voteBtn: { color: '#0095f6', fontWeight: '800' },
  sep: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
  inputBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  input: { flex: 1, height: 40, borderWidth: 1, borderColor: '#eee', borderRadius: 10, paddingHorizontal: 10, color: '#000' },
  send: { marginLeft: 10, color: '#0095f6', fontWeight: '800' },
  loading: { marginTop: 40, textAlign: 'center' },
  countdown: { marginLeft: 'auto', color: '#111', fontWeight: '700' },
  selector: { width: 24, textAlign: 'center', color: '#888', fontWeight: '900' },
  selectorOn: { color: '#0095f6' },
})

