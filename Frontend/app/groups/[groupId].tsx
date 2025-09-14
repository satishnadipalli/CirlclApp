"use client"

import { apiService } from "@/services/api.service"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useLocalSearchParams, useRouter } from "expo-router"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { Alert, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View, Modal, ActivityIndicator, Platform, StatusBar, ScrollView } from "react-native"
import Icon from "react-native-vector-icons/MaterialIcons"
import * as ImagePicker from 'expo-image-picker'
import socketService from "@/services/socket.service"
 

interface Member { _id: string; name: string; profilePic?: string }
interface Group {
  _id: string
  name: string
  description?: string
  groupPic?: string
  creator: string | Member
  admins: string[] | Member[]
  members: Member[]
}

export default function GroupDetailsScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>()
  const routeParams = useLocalSearchParams<any>()
  const [group, setGroup] = useState<Group | null>(null)
  const [search, setSearch] = useState("")
  const [searchResults, setSearchResults] = useState<Member[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedToAdd, setSelectedToAdd] = useState<Record<string, boolean>>({})
  const router = useRouter()
  const searchInputRef = useRef<TextInput>(null)
  const debounceRef = useRef<any>(null)

  const [captionOpen, setCaptionOpen] = useState(false)
  const [captionText, setCaptionText] = useState("")
  const [pendingFileUri, setPendingFileUri] = useState<string | undefined>(undefined)
  const [postingDaily, setPostingDaily] = useState(false)
  const [promptModal, setPromptModal] = useState(false)
  const [promptText, setPromptText] = useState("")
  const [startModal, setStartModal] = useState(false)

  const isAdmin = (userId: string) => {
    const admins = (group?.admins || []) as any[]
    return admins.some((a) => (typeof a === "string" ? a : a._id) === userId)
  }

  const currentUserIdRef = React.useRef<string>("")
  useEffect(() => {
    (async () => {
      const userData = await AsyncStorage.getItem("user")
      const parsed = userData ? JSON.parse(userData) : null
      currentUserIdRef.current = parsed?.id || ""
    })()
  }, [])

  const loadGroup = async () => {
    try {
      const res = await apiService.getGroupInfo(groupId)
      if (res?.success) setGroup(res.group)
    } catch (e) {
      Alert.alert("Error", "Failed to load group details")
    }
  }

  useEffect(() => {
    loadGroup()
  }, [groupId])

  useEffect(() => {
    if ((routeParams as any)?.openSwarmStart === '1') {
      setStartModal(true)
    }
  }, [routeParams])

  const members = useMemo(() => {
    const list = group?.members || []
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter((m) => m.name?.toLowerCase().includes(q))
  }, [group, search])

  const onAddMembers = async () => {
    try {
      const ids = Object.keys(selectedToAdd).filter((id) => selectedToAdd[id])
      if (ids.length === 0) return Alert.alert("Select users to add")
      const res = await apiService.addGroupMembers(groupId, ids)
      if (res?.success) {
        await loadGroup()
        setSelectedToAdd({})
        setSearchResults([])
        setSearch("")
      } else {
        console.log("add new")
        Alert.alert("Failed", res?.message || "Could not add members")
      }
    } catch (e) {
      console.log("error")
      Alert.alert("Error", (e as Error).message)
    }
  }

  const onRemoveMember = async (memberId: string) => {
    try {
      const res = await apiService.removeGroupMember(groupId, memberId)
      if (res?.success) {
        await loadGroup()
      } else {
        Alert.alert("Failed", res?.message || "Could not remove member")
      }
    } catch (e) {
      Alert.alert("Error", (e as Error).message)
    }
  }

  const onPromote = async (memberId: string) => {
    try {
      const res = await apiService.promoteToAdmin(groupId, memberId)
      if (res?.success) await loadGroup()
    } catch (e) {
      Alert.alert("Error", (e as Error).message)
    }
  }

  const onDemote = async (memberId: string) => {
    try {
      const res = await apiService.demoteAdmin(groupId, memberId)
      if (res?.success) await loadGroup()
    } catch (e) {
      Alert.alert("Error", (e as Error).message)
    }
  }

  if (!group) return <View style={styles.container}><Text style={styles.loading}>Loading...</Text></View>

  const meIsAdmin = isAdmin(currentUserIdRef.current)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>{"‹"}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{group.name}</Text>
        {(() => {
          const meId = currentUserIdRef.current
          const creatorId = typeof group.creator === 'string' ? group.creator : (group.creator as any)?._id
          const amCreator = String(creatorId || '') === String(meId || '')
          if (amCreator) {
            return (
              <TouchableOpacity onPress={async () => {
                try {
                  const ok = await new Promise<boolean>((resolve) => {
                    Alert.alert('Delete group', 'Are you sure? This disables the group for all members.', [
                      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
                    ])
                  })
                  if (!ok) return
                  const r: any = await apiService.deleteGroup(String(groupId))
                  if (r?.success) { Alert.alert('Deleted', 'Group deleted'); router.back() } else { Alert.alert('Failed', r?.message || 'Could not delete') }
                } catch (e) { Alert.alert('Error', (e as Error).message) }
              }}>
                <Text style={[styles.actionDanger]}>Delete</Text>
              </TouchableOpacity>
            )
          }
          // member-only
          return (
            <TouchableOpacity onPress={async () => {
              try {
                const ok = await new Promise<boolean>((resolve) => {
                  Alert.alert('Leave group', 'Leave this group?', [
                    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                    { text: 'Leave', style: 'destructive', onPress: () => resolve(true) },
                  ])
                })
                if (!ok) return
                const r: any = await apiService.leaveGroup(String(groupId))
                if (r?.success) { Alert.alert('Left group', 'You left the group'); router.back() } else { Alert.alert('Failed', r?.message || 'Could not leave') }
              } catch (e) { Alert.alert('Error', (e as Error).message) }
            }}>
              <Text style={[styles.actionDanger]}>Leave</Text>
            </TouchableOpacity>
          )
        })()}
      </View>

      <View style={[styles.groupHero, { paddingHorizontal: 16 }]}>
        <View style={{ width: '100%', backgroundColor: '#eef2ff', borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Image source={{ uri: group.groupPic || "https://i.pravatar.cc/150?img=14" }} style={styles.heroAvatar} />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{group.name}</Text>
            {group.description ? <Text style={styles.heroDesc}>{group.description}</Text> : null}
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, marginTop: 12, paddingHorizontal: 2 }}>
          <TouchableOpacity onPress={() => router.push({ pathname: '/mediaGallery', params: { chatType: 'group', chatId: String(groupId) } })} style={styles.pillPrimary}>
            <Text style={styles.pillPrimaryText}>Media gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push({ pathname: '/bookmarks', params: { chatType: 'group', chatId: String(groupId), kind: 'starred' } })} style={styles.pill}>
            <Text style={styles.pillText}>Starred</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push({ pathname: '/bookmarks', params: { chatType: 'group', chatId: String(groupId), kind: 'pinned' } })} style={styles.pill}>
            <Text style={styles.pillText}>Pinned</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push({ pathname: '/swarms/outcomes/[groupId]', params: { groupId: String(groupId) } })} style={styles.pill}>
            <Text style={styles.pillText}>Outcomes</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStartModal(true)} style={styles.pillPrimary}>
            <Text style={styles.pillPrimaryText}>Start Swarm</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <View style={styles.actionsBar}>
        <TextInput
          placeholder="Type a name to find people to add"
          value={search}
          onChangeText={(t) => {
            setSearch(t)
            if (debounceRef.current) clearTimeout(debounceRef.current)
            if (t.trim().length < 2) {
              setSearchResults([])
              setSelectedToAdd({})
              return
            }
            debounceRef.current = setTimeout(async () => {
              try {
                setSearchLoading(true)
                const resp = await apiService.searchUsers(t.trim(), 1, 20, String(groupId))
                const list: Member[] = Array.isArray((resp as any)?.users) ? (resp as any).users : []
                setSearchResults(list)
              } catch {
                setSearchResults([])
              } finally {
                setSearchLoading(false)
              }
            }, 300)
          }}
          style={[styles.search, { height: 44 }]}
          ref={searchInputRef}
        />
        {meIsAdmin && (
          <TouchableOpacity onPress={onAddMembers}>
            <Text style={styles.addBtn}>Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Live search results for adding members */}
      {meIsAdmin && search.trim().length >= 2 && (
        <View style={{ maxHeight: 260 }}>
          {searchLoading ? (
            <Text style={{ textAlign: "center", color: "#666", paddingVertical: 8 }}>Searching...</Text>
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(u) => u._id}
              renderItem={({ item }) => {
                const selected = !!selectedToAdd[item._id]
                return (
                  <TouchableOpacity
                    style={styles.resultRow}
                    onPress={() => setSelectedToAdd((p) => ({ ...p, [item._id]: !p[item._id] }))}
                  >
                    <Image source={{ uri: item.profilePic || "https://i.pravatar.cc/100?img=12" }} style={styles.resultAvatar} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultName}>{item.name}</Text>
                    </View>
                    <View style={[styles.checkPill, selected && styles.checkPillOn]}>
                      <Text style={[styles.checkText, selected && styles.checkTextOn]}>{selected ? "Selected" : "Select"}</Text>
                    </View>
                  </TouchableOpacity>
                )
              }}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
            />)
          }
        </View>
      )}

      {/* Group Daily section */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <Text style={{ fontWeight: '700', marginBottom: 8 }}>Group Daily</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {meIsAdmin && (
            <TouchableOpacity onPress={() => setPromptModal(true)} style={{ backgroundColor: '#111', borderRadius: 10, paddingHorizontal: 12, justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Set Prompt</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={async () => {
            try {
              const res = await apiService.getGroupDailyFeed(String(groupId))
              const entries = (res as any)?.entries || []
              if (entries.length === 0) {
                Alert.alert('Group Daily', 'No entries yet today')
              } else {
                router.push({ pathname: '/daily/viewer', params: { groupId: String(groupId) } })
              }
            } catch (e) {
              Alert.alert('Error', (e as Error).message)
            }
          }} style={{ backgroundColor: '#eee', flex: 1, borderRadius: 10, alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ fontWeight: '700' }}>View Today</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={async () => {
            try {
              const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
              if (status !== 'granted') return
              const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.8, videoMaxDuration: 30 })
              let fileUri: string | undefined
              if (!pick.canceled && pick.assets?.length) fileUri = pick.assets[0].uri
              setPendingFileUri(fileUri)
              setCaptionOpen(true)
            } catch (e) {
              Alert.alert('Error', (e as Error).message)
            }
          }} style={{ backgroundColor: '#0095f6', borderRadius: 10, paddingHorizontal: 12, justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>Post</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={captionOpen} transparent animationType="fade" onRequestClose={() => setCaptionOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, width: '100%' }}>
            <Text style={{ fontWeight: '800', fontSize: 16, marginBottom: 8 }}>Add a caption (optional)</Text>
            <TextInput value={captionText} onChangeText={setCaptionText} placeholder="Say something" placeholderTextColor="#999" style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 10, paddingHorizontal: 10, height: 44, color: '#000' }} />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <TouchableOpacity onPress={() => { setCaptionOpen(false); setCaptionText(""); setPendingFileUri(undefined) }}>
                <Text style={{ color: '#666', fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={postingDaily} onPress={async () => {
                try {
                  setPostingDaily(true)
                  const r = await apiService.postGroupDailyEntry(String(groupId), { text: captionText, fileUri: pendingFileUri })
                  if ((r as any)?.success) {
                    setCaptionOpen(false)
                    setCaptionText("")
                    setPendingFileUri(undefined)
                    Alert.alert('Posted', 'Your group Daily is live')
                  } else {
                    Alert.alert('Failed', (r as any)?.message || 'Could not post')
                  }
                } catch (e) {
                  Alert.alert('Error', (e as Error).message)
                } finally {
                  setPostingDaily(false)
                }
              }}>
                <Text style={{ color: postingDaily ? '#aaa' : '#0095f6', fontWeight: '800' }}>{postingDaily ? 'Posting…' : 'Post'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Prompt modal */}
      <Modal visible={promptModal} transparent animationType="fade" onRequestClose={() => setPromptModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, width: '100%' }}>
            <Text style={{ fontWeight: '800', fontSize: 16, marginBottom: 8 }}>Set today's group prompt</Text>
            <TextInput value={promptText} onChangeText={setPromptText} placeholder="e.g., Share your win today" placeholderTextColor="#888" style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 10, paddingHorizontal: 10, height: 44, color: '#000' }} />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <TouchableOpacity onPress={() => setPromptModal(false)}>
                <Text style={{ color: '#666', fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async () => {
                try {
                  const t = promptText.trim()
                  if (t.length < 4) { Alert.alert('Prompt too short'); return }
                  const r: any = await apiService.request(`/daily/group/${groupId}/prompt`, { method: 'POST', body: JSON.stringify({ text: t }) })
                  if (r?.success) { setPromptModal(false); setPromptText(''); Alert.alert('Saved', 'Group prompt set for today.') }
                  else Alert.alert('Failed', r?.message || 'Could not set prompt')
                } catch (e) { Alert.alert('Error', (e as Error).message) }
              }}>
                <Text style={{ color: '#0095f6', fontWeight: '800' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Start Swarm modal */}
      <StartSwarmModal visible={startModal} onClose={() => setStartModal(false)} group={group} groupId={String(groupId)} onStarted={(sid) => {
        setStartModal(false)
        router.push({ pathname: '/swarms/[swarmId]', params: { swarmId: String(sid) } })
      }} />

      <FlatList
        data={members}
        keyExtractor={(m) => m._id}
        renderItem={({ item }) => {
          const isItemAdmin = isAdmin(item._id)
          const meId = currentUserIdRef.current
          return (
            <View style={styles.row}>
              <Image source={{ uri: item.profilePic || "https://i.pravatar.cc/100?img=12" }} style={styles.rowAvatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.name}</Text>
                {isItemAdmin && <Text style={styles.rowRole}>Admin</Text>}
              </View>
              {meId !== item._id && (
                <View style={styles.rowActions}>
                  {/* Follow/Unfollow button */}
                  <FollowButton memberId={item._id} />
                  {/* Admin actions (only if I am admin) */}
                  {meIsAdmin && (
                    <>
                      {isItemAdmin ? (
                        <TouchableOpacity onPress={() => onDemote(item._id)}>
                          <Text style={styles.actionDanger}>Remove admin</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity onPress={() => onPromote(item._id)}>
                          <Text style={styles.actionPrimary}>Make admin</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => onRemoveMember(item._id)}>
                        <Text style={styles.actionDanger}>Remove</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}
            </View>
          )
        }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />
    </View>
  )
}
const StartSwarmModal: React.FC<{ visible: boolean; onClose: () => void; group: Group; groupId: string; onStarted: (sid: string) => void }> = ({ visible, onClose, group, groupId, onStarted }) => {
  const { useSafeAreaInsets } = require('react-native-safe-area-context')
  const insets = useSafeAreaInsets ? useSafeAreaInsets() : { bottom: 0 }
  const [prompt, setPrompt] = useState(`Quick brainstorm: How might we improve ${group?.name || 'this group'}?`)
  const [duration, setDuration] = useState('15')
  const [busy, setBusy] = useState(false)
  const suggestedInvites = (group?.members || []).slice(0, 6).map((m) => (typeof m === 'string' ? m : (m as any)._id))
  const [invited, setInvited] = useState<Record<string, boolean>>(() => Object.fromEntries(suggestedInvites.map((id) => [id, true])))
  // close on hardware back when open
  React.useEffect(() => {
    if (!visible) return
    const sub = (require('react-native') as any).BackHandler.addEventListener('hardwareBackPress', () => {
      try { onClose() } catch {}
      return true
    })
    return () => { try { sub?.remove?.() } catch {} }
  }, [visible])

  const start = async () => {
    if (busy) return
    setBusy(true)
    try {
      const invitedUserIds = Object.keys(invited).filter((id) => invited[id])
      const resp: any = await apiService.createSwarm({ groupId, prompt: prompt.trim(), invitedUserIds, durationMinutes: Number(duration) || 15 })
      if (resp?.success && resp?.swarm?._id) {
        try { socketService.joinSwarm(String(resp.swarm._id)) } catch {}
        onStarted(String(resp.swarm._id))
      } else {
        Alert.alert('Failed', resp?.message || 'Could not start')
      }
    } catch (e) { Alert.alert('Error', (e as Error).message) } finally { setBusy(false) }
  }

  return (
    <Modal visible={visible} transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Overlay fades immediately */}
        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' }} />
        <TouchableOpacity activeOpacity={1} style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 24, paddingHorizontal: 18, paddingBottom: (insets?.bottom || 0) + 28, minHeight: 420 }}>
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <View style={{ width: 36, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2 }} />
          </View>
          <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 20, marginBottom: 10 }}>Start a Swarm</Text>
          <TextInput value={prompt} onChangeText={setPrompt} placeholder="Swarm prompt" placeholderTextColor="#888" style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, paddingHorizontal: 14, height: 52, color: '#000', marginBottom: 12 }} />
          <TextInput value={duration} onChangeText={setDuration} keyboardType="number-pad" placeholder="Duration (minutes)" placeholderTextColor="#888" style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, paddingHorizontal: 14, height: 52, color: '#000', marginBottom: 12 }} />
          <Text style={{ fontWeight: '700', marginTop: 4, marginBottom: 10 }}>Invite (up to 6)</Text>
          <FlatList data={(group?.members || []) as any} keyExtractor={(m: any) => (typeof m === 'string' ? m : m._id)} horizontal style={{ maxHeight: 64, marginBottom: 16 }} renderItem={({ item }: any) => {
            const id = typeof item === 'string' ? item : item._id
            const name = typeof item === 'string' ? id.slice(-4) : (item.name || id.slice(-4))
            const on = !!invited[id]
            return (
              <TouchableOpacity onPress={() => setInvited((p) => ({ ...p, [id]: !p[id] }))} style={{ marginRight: 10, backgroundColor: on ? '#111827' : '#f1f5f9', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ color: on ? '#fff' : '#111827', fontWeight: '700' }}>{name}</Text>
              </TouchableOpacity>
            )
          }} />
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 'auto' }}>
            <TouchableOpacity onPress={onClose} style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#111827', fontWeight: '800' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={busy} onPress={start} style={{ flex: 1, backgroundColor: '#0095f6', height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.7 : 1 }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? 'Starting…' : 'Start'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const FollowButton: React.FC<{ memberId: string }> = ({ memberId }) => {
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const myIdRef = React.useRef<string>("")

  useEffect(() => {
    ;(async () => {
      const userData = await AsyncStorage.getItem("user")
      const me = userData ? JSON.parse(userData) : null
      myIdRef.current = me?.id || ""
      try {
        const meResp = await apiService.getMe()
        const meDoc = (meResp as any) || {}
        const following: string[] = meDoc?.following || meDoc?.data?.following || meDoc?.user?.following || []
        setIsFollowing(following.some((id) => id === memberId))
      } catch {}
    })()
  }, [memberId])

  const toggle = async () => {
    if (busy || isFollowing == null) return
    setBusy(true)
    try {
      if (isFollowing) {
        await apiService.unfollowUser(memberId)
        setIsFollowing(false)
      } else {
        await apiService.followUser(memberId)
        setIsFollowing(true)
      }
    } catch (e) {
      Alert.alert("Error", (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (isFollowing == null) return null

  return (
    <TouchableOpacity onPress={toggle} disabled={busy}>
      <Text style={[isFollowing ? styles.followingBtn : styles.followBtn]}>
        {isFollowing ? "Following" : busy ? "..." : "Follow"}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: Platform.OS === "android" ? StatusBar.currentHeight - 10 : 0, },
  header: { paddingHorizontal: 16, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { fontSize: 24 },
  title: { fontSize: 18, fontWeight: "700" },
  groupHero: { alignItems: "center", paddingVertical: 12 },
  heroAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#eee" },
  heroName: { fontSize: 20, fontWeight: "700", marginTop: 8 },
  heroDesc: { fontSize: 12, color: "#666", marginTop: 4 },
  pill: { backgroundColor: '#f1f5f9', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  pillText: { color: '#111', fontWeight: '800' },
  pillPrimary: { backgroundColor: '#111827', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  pillPrimaryText: { color: '#fff', fontWeight: '800' },
  actionsBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 8, marginVertical: 8 },
  search: { flex: 1, backgroundColor: "#f2f2f2", borderRadius: 10, paddingHorizontal: 12, height: 40 },
  addBtn: { color: "#0095f6", fontSize: 16, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  rowAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: "#eee" },
  rowName: { fontSize: 16, fontWeight: "600" },
  rowRole: { fontSize: 12, color: "#666" },
  rowActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  actionPrimary: { color: "#0095f6", fontSize: 12, fontWeight: "600" },
  actionDanger: { color: "#f33", fontSize: 12, fontWeight: "600" },
  sep: { height: 1, backgroundColor: "#eee", marginLeft: 68 },
  followBtn: { color: "#fff", backgroundColor: "#0095f6", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, overflow: "hidden", fontSize: 12, fontWeight: "700" },
  followingBtn: { color: "#0095f6", borderColor: "#0095f6", borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, overflow: "hidden", fontSize: 12, fontWeight: "700" },
  addFab: { position: "absolute", right: 16, top: 8, backgroundColor: "#0095f6", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  addFabText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  resultRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10 },
  resultAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: "#eee" },
  resultName: { fontSize: 14, fontWeight: "600" },
  checkPill: { borderWidth: 1, borderColor: "#ccc", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  checkPillOn: { borderColor: "#0095f6" },
  checkText: { color: "#666", fontWeight: "600" },
  checkTextOn: { color: "#0095f6" },
})

