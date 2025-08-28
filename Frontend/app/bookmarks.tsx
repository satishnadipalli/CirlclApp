"use client"

import { useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"
import { FlatList, Text, TouchableOpacity, View } from "react-native"
import { apiService } from "@/services/api.service"

export default function Bookmarks() {
  const { chatType, chatId, kind } = useLocalSearchParams<{ chatType: 'direct'|'group'; chatId: string; kind?: 'starred'|'pinned' }>()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const isStarred = (kind || 'starred') === 'starred'
  const [view, setView] = useState<'list'|'grid'>('list')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        let res: any
        if (chatType === 'direct') res = isStarred ? await apiService.getDirectStarred(String(chatId)) : await apiService.getDirectPinned(String(chatId))
        else res = isStarred ? await apiService.getGroupStarred(String(chatId)) : await apiService.getGroupPinned(String(chatId))
        setItems(Array.isArray(res?.messages) ? res.messages : [])
      } finally { setLoading(false) }
    })()
  }, [chatType, chatId, kind])

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 18, fontWeight: '800' }}>{isStarred ? 'Starred' : 'Pinned'}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={() => setView('list')} style={{ backgroundColor: view==='list' ? '#111' : '#f1f1f1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: view==='list' ? '#fff' : '#333', fontWeight: '700' }}>List</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setView('grid')} style={{ backgroundColor: view==='grid' ? '#111' : '#f1f1f1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: view==='grid' ? '#fff' : '#333', fontWeight: '700' }}>Grid</Text>
          </TouchableOpacity>
        </View>
      </View>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>Loading…</Text></View>
      ) : view === 'grid' ? (
        <FlatList
          data={items}
          keyExtractor={(m: any) => String(m._id)}
          numColumns={3}
          contentContainerStyle={{ paddingHorizontal: 2 }}
          renderItem={({ item }) => {
            const att = Array.isArray(item.attachments) && item.attachments.length ? item.attachments[0] : null
            const thumb = att?.url
            return (
              <View style={{ width: '33.33%', aspectRatio: 1, padding: 2 }}>
                <View style={{ flex: 1, backgroundColor: '#e9eef5', borderRadius: 10, overflow: 'hidden' }}>
                  {thumb ? (
                    <Image source={{ uri: thumb }} style={{ flex: 1 }} resizeMode="cover" />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                      <Text numberOfLines={3} style={{ color: '#333', textAlign: 'center', fontWeight: '700', fontSize: 12 }}>{item.text || ''}</Text>
                    </View>
                  )}
                </View>
              </View>
            )
          }}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m: any) => String(m._id)}
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', gap: 10 }}>
              <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: '#eef3ff', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 16 }}>⭐</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700' }}>{item?.from?.name || 'User'}</Text>
                <Text numberOfLines={2} style={{ color: '#333', marginTop: 2 }}>{item?.text || (Array.isArray(item?.attachments) && item.attachments.length ? '[attachment]' : '')}</Text>
                <Text style={{ color: '#999', fontSize: 12, marginTop: 4 }}>{new Date(item?.createdAt).toLocaleString()}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  )
}

