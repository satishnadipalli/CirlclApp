"use client"

import React, { useEffect, useState } from "react"
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, TextInput } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import api from "@/services/api.service"

export default function PostDetailScreen() {
  const { postId } = useLocalSearchParams() as { postId: string }
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [post, setPost] = useState<any>(null)
  const [liking, setLiking] = useState(false)
  const [commentText, setCommentText] = useState("")

  useEffect(() => {
    (async () => {
      try {
        const res: any = await api.getPostById(String(postId))
        if (res?.success) setPost(res.post)
      } finally { setLoading(false) }
    })()
  }, [postId])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    )
  }

  if (!post) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Post not found</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.link}>Go back</Text></TouchableOpacity>
      </View>
    )
  }

  const onLike = async () => {
    if (!post || liking) return
    setLiking(true)
    try {
      const prevLikes = Array.isArray(post.likes) ? post.likes.length : 0
      setPost((p: any) => ({ ...p, likes: new Array(prevLikes + 1).fill(0) }))
      const r: any = await api.likePost(String(post._id))
      if (r && r?.success !== false) {
        const fresh: any = await api.getPostById(String(post._id))
        if (fresh?.success) setPost(fresh.post)
      }
    } finally { setLiking(false) }
  }

  const onAddComment = async () => {
    const t = commentText.trim()
    if (!t) return
    try {
      setCommentText("")
      const r: any = await api.addComment(String(post._id), t)
      if (r && r?._id) {
        const fresh: any = await api.getPostById(String(post._id))
        if (fresh?.success) setPost(fresh.post)
      }
    } catch {}
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.link}>Back</Text></TouchableOpacity>
        <Text style={styles.title}>{post?.user?.name || "Post"}</Text>
        <View style={{ width: 50 }} />
      </View>

      {!!post.mediaUrl && <Image source={{ uri: post.mediaUrl }} style={styles.media} />}

      <View style={styles.metaRow}>
        <Image source={{ uri: post?.user?.profilePic || "https://i.pravatar.cc/150?img=5" }} style={styles.avatar} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.author}>{post?.user?.name}</Text>
          <Text style={styles.timestamp}>{new Date(post.createdAt).toLocaleString()}</Text>
        </View>
      </View>

      {!!post.title && <Text style={styles.postTitle}>{post.title}</Text>}
      {!!post.description && <Text style={styles.postDesc}>{post.description}</Text>}

      <View style={styles.counters}>
        <Text style={styles.counterText}>❤️ {post.likes?.length || 0}</Text>
        <Text style={styles.counterText}>💬 {post.comments?.length || 0}</Text>
        <TouchableOpacity style={styles.likeBtn} onPress={onLike} disabled={liking}><Text style={styles.likeText}>{liking ? 'Liking…' : 'Like'}</Text></TouchableOpacity>
      </View>

      {Array.isArray(post.comments) && post.comments.length > 0 && (
        <View style={styles.commentsBox}>
          <Text style={styles.sectionTitle}>Comments</Text>
          {post.comments.map((c: any) => (
            <View key={String(c._id)} style={styles.commentRow}>
              <Image source={{ uri: c?.user?.profilePic || "https://i.pravatar.cc/150?img=1" }} style={styles.commentAvatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.commentAuthor}>{c?.user?.name || "User"}</Text>
                <Text style={styles.commentText}>{c.text}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
      <View style={styles.commentComposer}>
        <TextInput
          value={commentText}
          onChangeText={setCommentText}
          placeholder="Add a comment…"
          style={styles.commentInput}
        />
        <TouchableOpacity onPress={onAddComment} disabled={!commentText.trim()}>
          <Text style={[styles.link, !commentText.trim() && { opacity: 0.4 }]}>Post</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { paddingBottom: 24 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { color: '#c00', marginBottom: 8 },
  link: { color: '#007AFF', fontSize: 16 },
  header: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '600' },
  media: { width: '100%', aspectRatio: 1, backgroundColor: '#eee' },
  metaRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eee' },
  author: { fontSize: 16, fontWeight: '600' },
  timestamp: { fontSize: 12, color: '#666' },
  postTitle: { fontSize: 16, fontWeight: '600', paddingHorizontal: 16, marginBottom: 6 },
  postDesc: { fontSize: 14, color: '#333', paddingHorizontal: 16 },
  counters: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  counterText: { fontSize: 14, color: '#444' },
  commentsBox: { paddingHorizontal: 16, paddingTop: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  commentRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  commentAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#eee' },
  commentAuthor: { fontSize: 13, fontWeight: '600' },
  commentText: { fontSize: 14, color: '#333' },
  likeBtn: { marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: '#007AFF' },
  likeText: { color: '#fff', fontWeight: '600' },
  commentComposer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  commentInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
})