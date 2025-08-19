"use client"

import { apiService } from "@/services/api.service"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useLocalSearchParams, useRouter } from "expo-router"
import React, { useEffect, useMemo, useState } from "react"
import { ActivityIndicator, FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native"

interface UserLite { _id: string; name: string; profilePic?: string; username?: string }

export default function FollowersScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [followers, setFollowers] = useState<UserLite[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [myFollowing, setMyFollowing] = useState<Set<string>>(new Set())

  const loadMyFollowing = async () => {
    try {
      const me = await apiService.getMe()
      const meObj: any = me
      const list: string[] = meObj?.following || meObj?.user?.following || []
      setMyFollowing(new Set(list.map(String)))
    } catch {}
  }

  const fetchFollowers = async (p = 1, replace = false) => {
    try {
      let id = String(userId || "").trim()
      if (!id) {
        const raw = await AsyncStorage.getItem("user")
        const parsed = raw ? JSON.parse(raw) : null
        id = parsed?.id || parsed?._id || ""
      }
      if (!id) {
        setLoading(false)
        setFollowers([])
        return
      }
      const resp = (await apiService.getFollowers(id, p, 20)) as any
      const users: UserLite[] = resp?.users || []
      if (replace) setFollowers(users)
      else setFollowers((prev) => (p === 1 ? users : [...prev, ...users]))
      const totalPages = Number(resp?.pages || 1)
      setPages(totalPages)
      setPage(p)
      setHasMore(p < totalPages)
    } catch (e) {
      setFollowers([])
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([loadMyFollowing(), fetchFollowers(1, true)])
      .then(() => {})
      .catch(() => setLoading(false))
  }, [userId])

  const onRefresh = async () => {
    setRefreshing(true)
    await Promise.all([loadMyFollowing(), fetchFollowers(1, true)])
  }

  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    await fetchFollowers(page + 1)
  }

  const toggleFollow = async (targetId: string) => {
    try {
      const isFollowing = myFollowing.has(targetId)
      if (isFollowing) {
        await apiService.unfollowUser(targetId)
        setMyFollowing((prev) => {
          const next = new Set(prev)
          next.delete(targetId)
          return next
        })
      } else {
        await apiService.followUser(targetId)
        setMyFollowing((prev) => new Set(prev).add(targetId))
      }
    } catch {}
  }

  const renderItem = ({ item }: { item: UserLite }) => {
    const followed = myFollowing.has(item._id)
    return (
      <View style={styles.row}>
        <TouchableOpacity onPress={() => router.push(`/otherProfile?userId=${item._id}`)} style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <Image source={{ uri: item.profilePic || "https://i.pravatar.cc/100?img=12" }} style={styles.avatar} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.name}</Text>
            {!!item.username && <Text style={styles.username}>@{item.username}</Text>}
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => toggleFollow(item._id)}>
          <Text style={[followed ? styles.followingBtn : styles.followBtn]}>{followed ? "Following" : "Follow"}</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>{"‹"}</Text></TouchableOpacity>
        <Text style={styles.title}>Followers</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={{ paddingTop: 30 }}><ActivityIndicator /></View>
      ) : (
        <FlatList
          data={followers}
          keyExtractor={(u) => u._id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.2}
          ListFooterComponent={loadingMore ? <View style={{ paddingVertical: 12 }}><ActivityIndicator /></View> : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 50 },
  header: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { fontSize: 24 },
  title: { fontSize: 18, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: "#eee" },
  name: { fontSize: 16, fontWeight: "600" },
  username: { fontSize: 12, color: "#666" },
  followBtn: { color: "#fff", backgroundColor: "#0095f6", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, overflow: "hidden", fontSize: 12, fontWeight: "700" },
  followingBtn: { color: "#0095f6", borderColor: "#0095f6", borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, overflow: "hidden", fontSize: 12, fontWeight: "700" },
  sep: { height: 1, backgroundColor: "#eee", marginLeft: 72 },
})

