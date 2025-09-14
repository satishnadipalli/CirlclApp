"use client"

import { apiService } from "@/services/api.service"
import socketService from "@/services/socket.service"
import { useLocalSearchParams, useRouter } from "expo-router"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { Alert, FlatList, KeyboardAvoidingView, Platform, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from "react-native"
import { LinearGradient } from "expo-linear-gradient"

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
  const sendingRef = useRef<boolean>(false)

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
      setSwarm((prev: any) => {
        const current = (prev?.ideas || [])
        const exists = current.some((i: any) => String(i?._id) === String(payload?.idea?._id))
        if (exists) return prev
        return { ...(prev || {}), ideas: ([...current, payload.idea]) }
      })
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
    if (t.length < 2) { Alert.alert('Idea too short', 'Please write a bit more.'); return }
    if (phase !== 'diverge') { Alert.alert('Not accepting ideas', 'The host needs to open the Diverge phase.'); return }
    if (sendingRef.current) return
    sendingRef.current = true
    // Optimistic add
    const tempId = `temp_${Date.now()}`
    setSwarm((prev: any) => ({ ...(prev || {}), ideas: [ ...(prev?.ideas || []), { _id: tempId, author: 'me', text: t, votes: 0 } ] }))
    setIdeaText("")
    try {
      const r: any = await apiService.addIdea(String(swarmId), t)
      if (!(r?.success && r?.idea)) {
        // Revert optimistic on failure
        setSwarm((prev: any) => ({ ...(prev || {}), ideas: (prev?.ideas || []).filter((i: any) => String(i._id) !== tempId) }))
        Alert.alert('Failed', r?.message || 'Could not add idea')
      } else {
        // Replace temp with server idea, or if socket already added it, just remove the temp
        setSwarm((prev: any) => {
          const list = (prev?.ideas || [])
          const alreadyThere = list.some((i: any) => String(i._id) === String(r.idea._id))
          if (alreadyThere) {
            return { ...(prev || {}), ideas: list.filter((i: any) => String(i._id) !== tempId) }
          }
          return { ...(prev || {}), ideas: list.map((i: any) => String(i._id) === tempId ? r.idea : i) }
        })
      }
    } catch (e) {
      setSwarm((prev: any) => ({ ...(prev || {}), ideas: (prev?.ideas || []).filter((i: any) => String(i._id) !== tempId) }))
      Alert.alert('Failed', (e as Error).message)
    } finally {
      sendingRef.current = false
    }
  }

  const vote = async (ideaId: string) => {
    const r: any = await apiService.voteIdea(String(swarmId), ideaId)
    if (!(r?.success)) Alert.alert('Failed', r?.message || 'Already voted?')
  }

  const startIfHost = async () => {
    const r: any = await apiService.startSwarm(String(swarmId))
    if (!(r?.success)) Alert.alert('Start failed', r?.message || 'Not allowed')
    else setPhase(String(r?.swarm?.lastPhase || 'diverge'))
  }
  const gotoPhase = async (p: 'diverge'|'cluster'|'vote'|'converge') => {
    const r: any = await apiService.setSwarmPhase(String(swarmId), p)
    if (!(r?.success)) Alert.alert('Failed', r?.message || 'Not allowed')
    else setPhase(p)
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
    else { setActionText(""); setPhase('converge') }
  }

  const endIfHost = async () => {
    const r: any = await apiService.endSwarm(String(swarmId))
    if (!(r?.success)) Alert.alert('End failed', r?.message || 'Not allowed')
  }

  if (loading || !swarm) return <View style={styles.container}><Text style={styles.loading}>Loading…</Text></View>

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={["#0f172a", "#1e293b"]} start={[0,0]} end={[1,1]} style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>{"‹"}</Text></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: '#fff' }]}>Swarm Session</Text>
          <Text style={{ color: '#a5b4fc', fontWeight: '700' }}>{phase.toUpperCase()}</Text>
        </View>
        {endsIn > 0 && (
          <View style={styles.countdownPill}><Text style={{ color: '#0f172a', fontWeight: '800' }}>{Math.floor(endsIn/60)}:{String(endsIn%60).padStart(2,'0')}</Text></View>
        )}
        {isHost && phase !== 'ended' ? (
          <TouchableOpacity onPress={endIfHost}><Text style={[styles.actionDanger, { color: '#fecaca' }]}>End</Text></TouchableOpacity>
        ) : <View style={{ width: 40 }} />}
      </LinearGradient>

      <View style={styles.promptBox}>
        <Text style={styles.prompt}>{swarm?.prompt}</Text>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {isHost && phase === 'lobby' && <TouchableOpacity onPress={startIfHost}><Text style={styles.primary}>Start</Text></TouchableOpacity>}
          {isHost && phase !== 'lobby' && phase !== 'ended' && (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <TouchableOpacity onPress={() => gotoPhase('diverge')}><Text style={[styles.chip, phase==='diverge' && styles.chipOn]}>Diverge</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => gotoPhase('cluster')}><Text style={[styles.chip, phase==='cluster' && styles.chipOn]}>Cluster</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => gotoPhase('vote')}><Text style={[styles.chip, phase==='vote' && styles.chipOn]}>Vote</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => gotoPhase('converge')}><Text style={[styles.chip, phase==='converge' && styles.chipOn]}>Converge</Text></TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}>
        {/* Ideas list */}
        <Text style={{ fontWeight: '800', marginBottom: 6 }}>Ideas</Text>
        {ideas.map((item) => (
          <View key={item._id} style={styles.ideaCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity disabled={!isHost || phase !== 'cluster'} onPress={() => setSelectedForCluster((p) => ({ ...p, [item._id]: !p[item._id] }))}>
                <Text style={[styles.selector, selectedForCluster[item._id] && styles.selectorOn]}>{selectedForCluster[item._id] ? '●' : '○'}</Text>
              </TouchableOpacity>
              <Text style={styles.ideaText}>{item.text}</Text>
            </View>
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
        <TextInput
          value={ideaText}
          onChangeText={setIdeaText}
          placeholder={phase === 'diverge' ? "Add an idea…" : "Waiting for host to open Diverge"}
          placeholderTextColor="#9ca3af"
          style={styles.input}
          editable={phase === 'diverge'}
          onSubmitEditing={sendIdea}
          returnKeyType="send"
        />
        {phase !== 'diverge' && isHost ? (
          <TouchableOpacity onPress={() => gotoPhase('diverge')}><Text style={styles.primary}>Open Diverge</Text></TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={sendIdea}><Text style={styles.send}>Send</Text></TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) - 10 : 0 },
  topBar: { paddingHorizontal: 16, paddingBottom: 10, paddingTop: 10, flexDirection: 'row', alignItems: 'center' },
  back: { fontSize: 24 },
  title: { fontSize: 18, fontWeight: '800' },
  actionDanger: { color: '#f33', fontSize: 14, fontWeight: '700' },
  promptBox: { backgroundColor: '#f7f7f7', margin: 16, padding: 12, borderRadius: 12 },
  prompt: { fontWeight: '700', marginBottom: 6 },
  phase: { color: '#555', fontWeight: '600' },
  chip: { color: '#111', backgroundColor: '#eef2ff', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6, fontWeight: '800' },
  chipOn: { backgroundColor: '#c7d2fe' },
  ideaCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#eee' },
  ideaText: { flex: 1, fontSize: 14, fontWeight: '600', marginRight: 10 },
  voteBtn: { color: '#0095f6', fontWeight: '800' },
  sep: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
  inputBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  input: { flex: 1, height: 40, borderWidth: 1, borderColor: '#eee', borderRadius: 10, paddingHorizontal: 10, color: '#000' },
  send: { marginLeft: 10, color: '#0095f6', fontWeight: '800' },
  loading: { marginTop: 40, textAlign: 'center' },
  countdown: { marginLeft: 'auto', color: '#111', fontWeight: '700' },
  countdownPill: { backgroundColor: '#bfdbfe', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginRight: 8 },
  selector: { width: 24, textAlign: 'center', color: '#888', fontWeight: '900' },
  selectorOn: { color: '#0095f6' },
})

