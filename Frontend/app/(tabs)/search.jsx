import { useRouter } from "expo-router"
import { useEffect, useState, useRef } from "react"
import { View, Text, FlatList, ActivityIndicator, Image } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { styles } from "@/styles/search"
import { apiService } from "@/services/api.service"

const SearchTab = () => {
  const [search, setSearch] = useState("")
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [explore, setExplore] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const loadingMoreRef = useRef(false)
  const router = useRouter()

  useEffect(() => {
    // Initial explore load
    loadExplore(1, true)
  }, [])

  const loadExplore = async (p = 1, replace = false) => {
    if (loadingMoreRef.current) return
    loadingMoreRef.current = true
    try {
      const res = await apiService.getExplore(p, 18)
      const items = (res && (res as any).posts) || []
      setExplore((prev) => (replace ? items : p === 1 ? items : [...prev, ...items]))
      setHasMore((res as any)?.hasMore ?? items.length > 0)
      setPage(p)
    } catch (e) {
      // ignore
    } finally {
      loadingMoreRef.current = false
    }
  }

  const onEndReached = () => {
    if (!isSearching && hasMore && !loadingMoreRef.current) {
      loadExplore(page + 1)
    }
  }

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (search.trim().length > 0) {
        searchUsers(search.trim())
      } else {
        setUsers([])
        setIsSearching(false)
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [search])

  const searchUsers = async (query: string) => {
    setLoading(true)
    setIsSearching(true)
    try {
      const res = await apiService.searchUsers(query)
      setUsers(res)
    } catch (e) {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  const renderUserItem = ({ item }: { item: any }) => (
    <View style={styles.userItem}>
      <Image source={{ uri: item.profilePicture || "https://i.pravatar.cc/500?img=21" }} style={styles.userImage} />
      <Text style={styles.userName}>{item.username}</Text>
    </View>
  )

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={24} color="#888" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search users..."
          value={search}
          onChangeText={setSearch}
          onFocus={() => setIsSearching(true)}
          onBlur={() => {
            if (search.trim().length === 0) {
              setIsSearching(false)
            }
          }}
        />
      </View>

      {isSearching ? (
        <View style={styles.searchResults}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0095f6" />
              <Text style={styles.loadingText}>Searching users...</Text>
            </View>
          ) : users.length > 0 ? (
            <FlatList
              data={users}
              keyExtractor={(item) => item._id || item.id}
              renderItem={renderUserItem}
              showsVerticalScrollIndicator={false}
              style={styles.usersList}
            />
          ) : (
            <View style={styles.noResultsContainer}>
              <Ionicons name="person-outline" size={50} color="#ccc" />
              <Text style={styles.noResultsText}>No users found</Text>
              <Text style={styles.noResultsSubtext}>Try searching for a different name</Text>
            </View>
          )}
        </View>
      ) : (
        /* Explore Grid */
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
      )}
    </View>
  )
}

export default SearchTab