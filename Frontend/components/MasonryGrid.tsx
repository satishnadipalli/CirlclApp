import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Dimensions, Image, TouchableOpacity, View } from 'react-native'

type MasonryItem = {
  id: string
  uri: string
}

interface MasonryGridProps {
  items: MasonryItem[]
  numColumns?: number
  gap?: number
  onPressItem?: (item: MasonryItem) => void
}

type ItemWithSize = MasonryItem & { width?: number; height?: number }

export default function MasonryGrid({ items, numColumns = 2, gap = 6, onPressItem }: MasonryGridProps) {
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({})
  const pendingRef = useRef(new Set<string>())
  const containerWidth = Dimensions.get('window').width - 2 * 6
  const columnWidth = useMemo(() => (containerWidth - gap * (numColumns - 1)) / numColumns, [containerWidth, gap, numColumns])

  useEffect(() => {
    items.forEach((it) => {
      if (sizes[it.id] || pendingRef.current.has(it.id)) return
      pendingRef.current.add(it.id)
      Image.getSize(it.uri,
        (w, h) => {
          setSizes((prev) => ({ ...prev, [it.id]: { w, h } }))
          pendingRef.current.delete(it.id)
        },
        () => { pendingRef.current.delete(it.id) }
      )
    })
  }, [items, sizes])

  const columns = useMemo(() => {
    const cols: Array<{ height: number; items: Array<ItemWithSize & { renderH: number }> }> = Array.from({ length: numColumns }, () => ({ height: 0, items: [] }))
    for (const it of items) {
      const sz = sizes[it.id]
      const h = sz ? Math.max(60, (sz.h / Math.max(1, sz.w)) * columnWidth) : columnWidth
      let target = 0
      let minH = cols[0].height
      for (let i = 1; i < numColumns; i++) { if (cols[i].height < minH) { minH = cols[i].height; target = i } }
      cols[target].items.push({ ...it, width: sz?.w, height: sz?.h, renderH: h })
      cols[target].height += h + gap
    }
    return cols
  }, [items, sizes, columnWidth, gap, numColumns])

  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: 6, gap }}>
      {columns.map((col, idx) => (
        <View key={idx} style={{ width: columnWidth, gap }}>
          {col.items.map((it) => (
            <TouchableOpacity key={it.id} onPress={() => onPressItem && onPressItem(it)} activeOpacity={0.8}>
              <Image source={{ uri: it.uri }} style={{ width: columnWidth, height: it.renderH, borderRadius: 10, backgroundColor: '#eee' }} />
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  )
}

