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
    <View style={{ flex: 1, padding: 12 }}>
      <Text style={{ fontSize: 16, fontWeight: '800', marginBottom: 8 }}>{isStarred ? 'Starred' : 'Pinned'} messages</Text>
      {loading ? <Text>Loading…</Text> : (
        <FlatList
          data={items}
          keyExtractor={(m: any) => String(m._id)}
          renderItem={({ item }) => (
            <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
              <Text style={{ fontWeight: '700' }}>{item?.from?.name || 'User'}</Text>
              <Text>{item?.text || (Array.isArray(item?.attachments) && item.attachments.length ? '[attachment]' : '')}</Text>
              <Text style={{ color: '#999', fontSize: 12 }}>{new Date(item?.createdAt).toLocaleString()}</Text>
            </View>
          )}
        />
      )}
    </View>
  )
}

