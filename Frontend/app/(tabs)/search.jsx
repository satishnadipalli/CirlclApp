"use client"

import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useRouter } from "expo-router"
import { useEffect, useState } from "react"
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    Image,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native"

const { width } = Dimensions.get("window")

const posts = [
  {
    id: "1",
    uri: "https://res.cloudinary.com/dlehbizfp/image/upload/f_jpg/v1755065855/circle_uploads/jqn1ydnekml88cf4k2f0.jpg",
    type: "image",
  },
  {
    id: "2",
    uri: "https://res.cloudinary.com/dlehbizfp/image/upload/f_jpg/v1755065855/circle_uploads/jqn1ydnekml88cf4k2f0.jpg",
    type: "video",
  },
  {
    id: "3",
    uri: "https://res.cloudinary.com/dlehbizfp/image/upload/f_jpg/v1755065855/circle_uploads/jqn1ydnekml88cf4k2f0.jpg",
    type: "image",
  },
  {
    id: "4",
    uri: "https://res.cloudinary.com/dlehbizfp/image/upload/f_jpg/v1755065855/circle_uploads/jqn1ydnekml88cf4k2f0.jpg",
    type: "video",
  },
  {
    id: "5",
    uri: "https://res.cloudinary.com/dlehbizfp/image/upload/f_jpg/v1755065855/circle_uploads/jqn1ydnekml88cf4k2f0.jpg",
    type: "image",
  },
  {
    id: "6",
    uri: "https://res.cloudinary.com/dlehbizfp/image/upload/f_jpg/v1755065855/circle_uploads/jqn1ydnekml88cf4k2f0.jpg",
    type: "image",
  },
  {
    id: "7",
    uri: "https://res.cloudinary.com/dlehbizfp/image/upload/f_jpg/v1755065855/circle_uploads/jqn1ydnekml88cf4k2f0.jpg",
    type: "video",
  },
  {
    id: "8",
    uri: "https://res.cloudinary.com/dlehbizfp/image/upload/f_jpg/v1755065855/circle_uploads/jqn1ydnekml88cf4k2f0.jpg",
    type: "image",
  },
]

export default function SearchScreen() {
  const [search, setSearch] = useState("")
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const router = useRouter()

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

  const searchUsers = async (query) => {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      console.log('No token found');
      return;
    }

    setLoading(true)
    setIsSearching(true)

    try {
      // Replace with your actual API endpoint and token
      const response = await fetch(`http://192.168.53.127:5000/api/users/search?q=${encodeURIComponent(query)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      })

      if (response.ok) {
        const data = await response.json()
        setUsers(data.users || [])
      } else {
        console.error("Search failed:", response.status)
        setUsers([])
      }
    } catch (error) {
      console.error("Search error:", error)
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  const renderUserItem = ({ item }) => (
    <TouchableOpacity style={styles.userItem}
      onPress={() =>
        router.push({
          pathname: "/otherProfile",
          params: { userId: item._id, name: item.name }
        })
      }

    >
      <Image
        source={{
          uri: item.profilePic || "https://via.placeholder.com/50x50/cccccc/666666?text=User",
        }}
        style={styles.userAvatar}
      />
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.name}</Text>
        <Text style={styles.userHandle}>@{item.username || item.email}</Text>
      </View>
    </TouchableOpacity>
  )

  const clearSearch = () => {
    setSearch("")
    setUsers([])
    setIsSearching(false)
  }

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color="#888" style={{ marginRight: 6 }} />
        <TextInput
          style={styles.input}
          placeholder="Search"
          placeholderTextColor="#888"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={clearSearch}>
            <Ionicons name="close-circle" size={20} color="#888" />
          </TouchableOpacity>
        )}
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
        /* Posts Grid */
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <Image source={{ uri: item.uri }} style={styles.image} />}
          numColumns={3}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f0f0",
    margin: 10,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginTop: 50,
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  image: {
    width: width / 3,
    height: width / 3,
  },
  searchResults: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 50,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  usersList: {
    flex: 1,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e0e0e0",
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    marginBottom: 2,
  },
  userHandle: {
    fontSize: 14,
    color: "#666",
  },
  noResultsContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  noResultsText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#666",
    marginTop: 15,
  },
  noResultsSubtext: {
    fontSize: 14,
    color: "#999",
    marginTop: 5,
  },
})
