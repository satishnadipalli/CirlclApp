"use client"

import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { FlatList, Text, TouchableOpacity, View, TextInput, Image } from "react-native"
import { apiService } from "@/services/api.service"

export default function Bookmarks() {
  const { chatType, chatId, kind } = useLocalSearchParams<{ chatType: 'direct'|'group'; chatId: string; kind?: 'starred'|'pinned' }>()
  const router = useRouter()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const isStarred = (kind || 'starred') === 'starred'
  const [view, setView] = useState<'list'|'grid'>('list')
  const [tab, setTab] = useState<'starred'|'pinned'>(isStarred ? 'starred' : 'pinned')
  const [q, setQ] = useState('')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        let res: any
        const useStar = (kind ? isStarred : tab === 'starred')
        if (chatType === 'direct') res = useStar ? await apiService.getDirectStarred(String(chatId)) : await apiService.getDirectPinned(String(chatId))
        else res = useStar ? await apiService.getGroupStarred(String(chatId)) : await apiService.getGroupPinned(String(chatId))
        setItems(Array.isArray(res?.messages) ? res.messages : [])
      } finally { setLoading(false) }
    })()
  }, [chatType, chatId, kind, tab])

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 18, fontWeight: '800' }}>{(kind ? isStarred : tab === 'starred') ? 'Starred' : 'Pinned'}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={() => setView('list')} style={{ backgroundColor: view==='list' ? '#111' : '#f1f1f1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ color: view==='list' ? '#fff' : '#333', fontWeight: '700' }}>List</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setView('grid')} style={{ backgroundColor: view==='grid' ? '#111' : '#f1f1f1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ color: view==='grid' ? '#fff' : '#333', fontWeight: '700' }}>Grid</Text>
            </TouchableOpacity>
          </View>
        </View>
        {!kind && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TouchableOpacity onPress={() => setTab('starred')} style={{ backgroundColor: tab==='starred' ? '#fff3c8' : '#f7f7f7', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: tab==='starred' ? '#ffe38a' : '#eee' }}>
              <Text style={{ fontWeight: '700', color: '#7a5200' }}>⭐ Starred</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTab('pinned')} style={{ backgroundColor: tab==='pinned' ? '#eaf4ff' : '#f7f7f7', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: tab==='pinned' ? '#cfe6ff' : '#eee' }}>
              <Text style={{ fontWeight: '700', color: '#29527a' }}>📌 Pinned</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={{ marginTop: 10, backgroundColor: '#f2f2f2', borderRadius: 10, paddingHorizontal: 10, height: 40, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: '#888' }}>🔎</Text>
          <TextInput value={q} onChangeText={setQ} placeholder="Search saved messages" placeholderTextColor="#999" style={{ marginLeft: 8, flex: 1, color: '#333' }} />
        </View>
      </View>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>Loading…</Text></View>
      ) : view === 'grid' ? (
        <FlatList
          data={items.filter((m: any) => !q.trim() || String(m?.text || '').toLowerCase().includes(q.toLowerCase()))}
          keyExtractor={(m: any) => String(m._id)}
          numColumns={3}
          contentContainerStyle={{ paddingHorizontal: 2 }}
          renderItem={({ item }) => {
            const att = Array.isArray(item.attachments) && item.attachments.length ? item.attachments[0] : null
            const thumb = att?.url
            return (
              <TouchableOpacity onPress={() => router.push({ pathname: `/chats/[chatId]`, params: { chatId: String(chatId), chatType: String(chatType), jumpToMessageId: String(item?._id || '') } })} style={{ width: '33.33%', aspectRatio: 1, padding: 2 }}>
                <View style={{ flex: 1, backgroundColor: '#e9eef5', borderRadius: 10, overflow: 'hidden' }}>
                  {thumb ? (
                    <Image source={{ uri: thumb }} style={{ flex: 1 }} resizeMode="cover" />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                      <Text numberOfLines={3} style={{ color: '#333', textAlign: 'center', fontWeight: '700', fontSize: 12 }}>{item.text || ''}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            )
          }}
        />
      ) : (
        <FlatList
          data={items.filter((m: any) => !q.trim() || String(m?.text || '').toLowerCase().includes(q.toLowerCase()))}
          keyExtractor={(m: any) => String(m._id)}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => router.push({ pathname: `/chats/[chatId]`, params: { chatId: String(chatId), chatType: String(chatType), jumpToMessageId: String(item?._id || '') } })} style={{ paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', gap: 10 }}>
              <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: '#eef3ff', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 16 }}>⭐</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700' }}>{item?.from?.name || 'User'}</Text>
                <Text numberOfLines={2} style={{ color: '#333', marginTop: 2 }}>{item?.text || (Array.isArray(item?.attachments) && item.attachments.length ? '[attachment]' : '')}</Text>
                <Text style={{ color: '#999', fontSize: 12, marginTop: 4 }}>{new Date(item?.createdAt).toLocaleString()}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  )
}

