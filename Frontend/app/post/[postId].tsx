"use client"

import React, { useEffect, useRef, useState } from "react"
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, TextInput, Platform } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import api from "@/services/api.service"
import { Video } from "expo-av"
import { useTheme } from "@/contexts/ThemeContext"

export default function PostDetailScreen() {
  const { colors } = useTheme()
  const { postId, focusCommentId } = useLocalSearchParams() as { postId: string; focusCommentId?: string }
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [post, setPost] = useState<any>(null)
  const [liking, setLiking] = useState(false)
  const [commentText, setCommentText] = useState("")
  const [replyFor, setReplyFor] = useState<string | null>(null)
  const [replyText, setReplyText] = useState<Record<string, string>>({})
  const scrollRef = useRef<ScrollView | null>(null)
  const commentY = useRef<Record<string, number>>({})

  const isVideo = (url?: string) => !!url && /(\.mp4|\.mov|\.webm)$/i.test(url)

  const fetchPost = async () => {
    const res: any = await api.getPostById(String(postId))
    if (res?.success) setPost(res.post)
  }

  useEffect(() => {
    (async () => {
      try {
        await fetchPost()
      } finally { setLoading(false) }
    })()
  }, [postId])

  useEffect(() => {
    if (!focusCommentId || !post) return
    const y = commentY.current[String(focusCommentId)]
    if (typeof y === 'number' && scrollRef.current) {
      setTimeout(() => {
        try { (scrollRef.current as any).scrollTo({ y: Math.max(0, y - 100), animated: true }) } catch {}
      }, 300)
    }
  }, [post, focusCommentId])

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!post) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.error, { color: colors.danger }]}>Post not found</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={[styles.link, { color: colors.primary }]}>Go back</Text></TouchableOpacity>
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
      if (r && r?.success !== false) await fetchPost()
    } finally { setLiking(false) }
  }

  const onAddComment = async () => {
    const t = commentText.trim()
    if (!t) return
    try {
      setCommentText("")
      await api.addComment(String(post._id), t)
      await fetchPost()
    } catch {}
  }

  const onReply = async (cid: string) => {
    const t = (replyText[cid] || "").trim()
    if (!t) return
    try {
      setReplyText((m) => ({ ...m, [cid]: "" }))
      await api.replyToComment(String(post._id), cid, t)
      await fetchPost()
      setReplyFor(null)
    } catch {}
  }

  const onLikeComment = async (cid: string, rid?: string) => {
    try {
      await api.likeComment(String(post._id), cid, rid)
      await fetchPost()
    } catch {}
  }

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Text style={[styles.link, { color: colors.primary }]}>Back</Text></TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{post?.user?.name || "Post"}</Text>
        <View style={{ width: 50 }} />
      </View>

      {!isVideo(post.mediaUrl) ? (
        Platform.OS === 'ios' ? (
          <ScrollView
            style={{ width: '100%', backgroundColor: '#000' }}
            minimumZoomScale={1}
            maximumZoomScale={3}
            contentContainerStyle={{ alignItems: 'center', justifyContent: 'center' }}
          >
            {!!post.mediaUrl && <Image source={{ uri: post.mediaUrl }} style={styles.media} resizeMode="contain" />}
          </ScrollView>
        ) : (
          !!post.mediaUrl && <Image source={{ uri: post.mediaUrl }} style={styles.media} />
        )
      ) : (
        <Video
          source={{ uri: post.mediaUrl }}
          style={styles.media}
          useNativeControls
          resizeMode={"contain" as any}
          shouldPlay={false}
          isMuted={false}
        />
      )}

      <View style={styles.metaRow}>
        <Image source={{ uri: post?.user?.profilePic || "https://i.pravatar.cc/150?img=5" }} style={styles.avatar} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.author, { color: colors.text }]}>{post?.user?.name}</Text>
          <Text style={[styles.timestamp, { color: colors.muted }]}>{new Date(post.createdAt).toLocaleString()}</Text>
        </View>
      </View>

      {!!post.title && <Text style={[styles.postTitle, { color: colors.text }]}>{post.title}</Text>}
      {!!post.description && <Text style={[styles.postDesc, { color: colors.text }]}>{post.description}</Text>}

      <View style={styles.counters}>
        <Text style={[styles.counterText, { color: colors.text }]}>❤️ {post.likes?.length || 0}</Text>
        <Text style={[styles.counterText, { color: colors.text }]}>💬 {post.comments?.length || 0}</Text>
        <TouchableOpacity style={[styles.likeBtn, { backgroundColor: colors.primary }]} onPress={onLike} disabled={liking}><Text style={styles.likeText}>{liking ? 'Liking…' : 'Like'}</Text></TouchableOpacity>
      </View>

      {Array.isArray(post.comments) && post.comments.length > 0 && (
        <View style={styles.commentsBox}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Comments</Text>
          {post.comments.map((c: any) => (
            <View key={String(c._id)} onLayout={(e) => { commentY.current[String(c._id)] = e.nativeEvent.layout.y }}>
              <View style={[styles.commentRow, focusCommentId === String(c._id) && { backgroundColor: colors.accent, borderRadius: 12, padding: 6 }]}>
                <Image source={{ uri: c?.user?.profilePic || "https://i.pravatar.cc/150?img=1" }} style={styles.commentAvatar} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.commentAuthor, { color: colors.text }]}>{c?.user?.name || "User"}</Text>
                  <Text style={[styles.commentText, { color: colors.text }]}>{c.text}</Text>
                  <View style={styles.commentActions}>
                    <TouchableOpacity onPress={() => setReplyFor(String(c._id))}><Text style={[styles.link, { color: colors.primary }]}>Reply</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => onLikeComment(String(c._id))}><Text style={[styles.link, { color: colors.primary }]}>Like</Text></TouchableOpacity>
                  </View>
                  {replyFor === String(c._id) && (
                    <View style={styles.replyComposer}>
                      <TextInput
                        value={replyText[String(c._id)] || ""}
                        onChangeText={(t) => setReplyText((m) => ({ ...m, [String(c._id)]: t }))}
                        placeholder="Reply…"
                        style={[styles.commentInput, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]}
                      />
                      <TouchableOpacity onPress={() => onReply(String(c._id))} disabled={!((replyText[String(c._id)] || "").trim())}>
                        <Text style={[styles.link, { color: colors.primary }, !((replyText[String(c._id)] || "").trim()) && { opacity: 0.4 }]}>Post</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {Array.isArray(c.replies) && c.replies.length > 0 && (
                    <View style={{ marginTop: 8, paddingLeft: 28 }}>
                      {c.replies.map((r: any) => (
                        <View key={String(r._id)} style={styles.replyRow}>
                          <Image source={{ uri: r?.user?.profilePic || "https://i.pravatar.cc/150?img=2" }} style={styles.replyAvatar} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.replyAuthor, { color: colors.text }]}>{r?.user?.name || "User"}</Text>
                            <Text style={[styles.replyText, { color: colors.text }]}>{r.text}</Text>
                            <View style={styles.commentActions}>
                              <TouchableOpacity onPress={() => onLikeComment(String(c._id), String(r._id))}><Text style={[styles.link, { color: colors.primary }]}>Like</Text></TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.commentComposer, { borderTopColor: colors.border }]}>
        <TextInput
          value={commentText}
          onChangeText={setCommentText}
          placeholder="Add a comment…"
          style={[styles.commentInput, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]}
        />
        <TouchableOpacity onPress={onAddComment} disabled={!commentText.trim()}>
          <Text style={[styles.link, { color: colors.primary }, !commentText.trim() && { opacity: 0.4 }]}>Post</Text>
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
  media: { width: '100%', aspectRatio: 1, backgroundColor: '#000' },
  metaRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eee' },
  author: { fontSize: 16, fontWeight: '600' },
  timestamp: { fontSize: 12, color: '#666' },
  postTitle: { fontSize: 16, fontWeight: '600', paddingHorizontal: 16, marginBottom: 6 },
  postDesc: { fontSize: 14, color: '#333', paddingHorizontal: 16 },
  counters: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  counterText: { fontSize: 14, color: '#444' },
  likeBtn: { marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: '#007AFF' },
  likeText: { color: '#fff', fontWeight: '600' },
  commentsBox: { paddingHorizontal: 16, paddingTop: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  commentRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  commentAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#eee' },
  commentAuthor: { fontSize: 13, fontWeight: '600' },
  commentText: { fontSize: 14, color: '#333' },
  commentActions: { flexDirection: 'row', gap: 16, marginTop: 6 },
  commentHighlight: { backgroundColor: '#FFF9D6', borderRadius: 12, padding: 6 },
  replyComposer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  replyRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  replyAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#eee', marginTop: 3 },
  replyAuthor: { fontSize: 13, fontWeight: '600' },
  replyText: { fontSize: 14, color: '#333' },
  commentComposer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  commentInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
})