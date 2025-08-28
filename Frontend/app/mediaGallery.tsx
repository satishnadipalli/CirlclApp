"use client"

import { useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"
import { FlatList, Image, Text, TouchableOpacity, View } from "react-native"
import { apiService } from "@/services/api.service"

export default function MediaGallery() {
  const { chatType, chatId } = useLocalSearchParams<{ chatType: 'direct'|'group'; chatId: string }>()
  const [items, setItems] = useState<Array<{ _id: string; attachments: Array<{ url: string; type: string }>; createdAt: string }>>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<'new'|'old'>('new')

  useEffect(() => {
    ;(async () => {
      try {
        setLoading(true)
        const res: any = chatType === 'direct'
          ? await apiService.getDirectMedia(String(chatId))
          : await apiService.getGroupMedia(String(chatId))
        const arr = Array.isArray(res?.items) ? res.items : []
        setItems(arr)
      } finally { setLoading(false) }
    })()
  }, [chatType, chatId])

  const renderItem = ({ item }: any) => {
    const att = Array.isArray(item.attachments) ? item.attachments[0] : null
    if (!att) return null
    const isVideo = /video/i.test(String(att.type || ''))
    return (
      <TouchableOpacity style={{ width: '33.33%', aspectRatio: 1, padding: 1 }}>
        <View style={{ flex: 1, backgroundColor: '#e9eef5', borderRadius: 8, overflow: 'hidden' }}>
          <Image source={{ uri: att.url }} style={{ flex: 1 }} resizeMode="cover" />
          <View style={{ position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ color: '#fff', fontSize: 10 }}>{new Date(item.createdAt).toLocaleDateString()}</Text>
          </View>
          {isVideo ? (
            <View style={{ position: 'absolute', right: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: '#fff', fontSize: 10 }}>Video</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    )
  }

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>Loading…</Text></View>

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 18, fontWeight: '800' }}>Media gallery</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={() => setSort('new')} style={{ backgroundColor: sort==='new' ? '#111' : '#f1f1f1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: sort==='new' ? '#fff' : '#333', fontWeight: '700' }}>Newest</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setItems((s) => [...s].reverse()); setSort((v) => v==='new'?'old':'new') }} style={{ backgroundColor: sort==='old' ? '#111' : '#f1f1f1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: sort==='old' ? '#fff' : '#333', fontWeight: '700' }}>Oldest</Text>
          </TouchableOpacity>
        </View>
      </View>
      <FlatList
        data={items}
        keyExtractor={(it: any) => String(it._id)}
        renderItem={renderItem}
        numColumns={3}
      />
    </View>
  )
}

