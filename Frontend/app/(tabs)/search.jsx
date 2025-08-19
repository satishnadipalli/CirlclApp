import { useEffect, useState, useRef } from "react"
import { FlatList } from "react-native"
import { Image } from "react-native"
import { useRouter } from "next/navigation"
import { apiService } from "@/services/api.service"
import { styles } from "@/styles/styles"

const Search = () => {
  const [isSearching, setIsSearching] = useState(false)
  const [explore, setExplore] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const loadingMoreRef = useRef(false)
  const router = useRouter()

  useEffect(() => {
    loadExplore(1, true)
  }, [])

  const loadExplore = async (p = 1, replace = false) => {
    if (loadingMoreRef.current) return
    loadingMoreRef.current = true
    try {
      const res = await apiService.getExplore(p, 18)
      const items = (res && (res.posts || []))
      setExplore((prev) => (replace ? items : p === 1 ? items : [...prev, ...items]))
      setHasMore((res && res.hasMore) ?? items.length > 0)
      setPage(p)
    } catch {}
    finally { loadingMoreRef.current = false }
  }

  const onEndReached = () => {
    if (!isSearching && hasMore && !loadingMoreRef.current) loadExplore(page + 1)
  }

  return (
    <FlatList
      data={explore}
      keyExtractor={(item, idx) => item._id || String(idx)}
      renderItem={({ item }) => (
        <Image source={{ uri: item.mediaUrl || "https://i.pravatar.cc/500?img=21" }} style={styles.image} />
      )}
      numColumns={3}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      showsVerticalScrollIndicator={false}
    />
  )
}

export default Search