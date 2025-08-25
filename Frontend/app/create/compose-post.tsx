"use client"

import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { Video } from "expo-av"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useState, useEffect, useRef } from "react"
import * as Location from "expo-location"
import {
    Alert,
    Dimensions,
    Image,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native"

const { height, width } = Dimensions.get("window")

const API_BASE_URL = require("../../constants/Config").API_BASE_URL
const DRAFT_KEY = 'compose_post_draft_v1'

export default function ComposePostScreen() {
  const router = useRouter()
  const { mediaData, postType } = useLocalSearchParams()

  const [caption, setCaption] = useState("")
  const [selectedMusic, setSelectedMusic] = useState(null)
  const [taggedPeople, setTaggedPeople] = useState([])
  const [location, setLocation] = useState<{ name?: string; lat?: number; lng?: number } | null>(null)
  const [aiLabelEnabled, setAiLabelEnabled] = useState(false)
  const [audience, setAudience] = useState("Everyone")
  const [shareOnPlatforms, setShareOnPlatforms] = useState([])
  const [isPosting, setIsPosting] = useState(false)
  const [hasDraft, setHasDraft] = useState(false)

  const [mediaList, setMediaList] = useState(() => {
    try {
      return JSON.parse(mediaData)
    } catch {
      return []
    }
  })

  const [uploadProgress, setUploadProgress] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const saveTimerRef = useRef<any>(null)

  const currentMedia = mediaList[0] // Show first media in preview

  const getAuthToken = async () => {
    try {
      const token = await AsyncStorage.getItem("token")
      return token
    } catch (error) {
      console.error("Error getting auth token:", error)
      return null
    }
  }

  const createPost = async (formData, token) => {
    try {
      // Use XMLHttpRequest to track upload progress
      const url = `${API_BASE_URL}/posts`
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        abortRef.current = new AbortController()
        xhr.open("POST", url)
        xhr.setRequestHeader("Authorization", `Bearer ${token}`)
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const pct = Math.round((event.loaded / event.total) * 100)
            setUploadProgress(pct)
          }
        }
        xhr.onerror = () => reject(new Error("Network error"))
        xhr.onabort = () => reject(new Error("Upload cancelled"))
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(true)
          else reject(new Error((() => { try { return JSON.parse(xhr.responseText)?.message } catch { return "Failed to create post" } })()))
        }
        xhr.send(formData)
      })

      // Fallback fetch to read response body
      const response = await fetch(`${API_BASE_URL}/posts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || "Failed to create post")
      }

      const data = await response.json()
      return data
    } catch (error) {
      console.error("Error creating post:", error)
      throw error
    }
  }

  const extractHashtagsAndMentions = (text) => {
    const hashtags = text.match(/#\w+/g) || []
    const mentions = text.match(/@\w+/g) || []

    return {
      hashtags: hashtags.map((tag) => tag.substring(1)), // Remove # symbol
      mentions: mentions.map((mention) => mention.substring(1)), // Remove @ symbol
    }
  }

  const compositionOptions = [
    // Temporarily hide unfinished options to keep UI clean
    // {
    //   id: "music",
    //   icon: "musical-notes-outline",
    //   label: "Add music",
    //   value: selectedMusic?.name || null,
    //   onPress: () => handleAddMusic(),
    // },
    // {
    //   id: "tag",
    //   icon: "person-outline",
    //   label: "Tag people",
    //   value: taggedPeople.length > 0 ? `${taggedPeople.length} people` : null,
    //   onPress: () => handleTagPeople(),
    // },
    {
      id: "location",
      icon: "location-outline",
      label: "Add location",
      value: location?.name || null,
      onPress: () => handleAddLocation(),
    },
  ]

  const handleAddMusic = () => {
    // Navigate to music selection screen or show music picker
    Alert.alert("Add Music", "Music selection feature coming soon!")
  }

  const handleTagPeople = () => {
    // Navigate to people tagging screen
    Alert.alert("Tag People", "People tagging feature coming soon!")
  }

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== "granted") return
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude })
      } catch {}
    })()
    return () => { abortRef.current?.abort?.() }
  }, [])

  // Load draft on first mount if no incoming media
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY)
        if (!raw) { setHasDraft(false); return }
        const draft = JSON.parse(raw)
        // Only auto-restore if no media passed from previous step
        if ((!mediaList || mediaList.length === 0) && Array.isArray(draft?.mediaList)) {
          setMediaList(draft.mediaList)
        }
        if (typeof draft?.caption === 'string') setCaption(draft.caption)
        if (typeof draft?.audience === 'string') setAudience(draft.audience)
        if (typeof draft?.aiLabelEnabled === 'boolean') setAiLabelEnabled(draft.aiLabelEnabled)
        if (draft?.location && (draft.location.lat != null || draft.location.name)) setLocation(draft.location)
        setHasDraft(true)
      } catch { setHasDraft(false) }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Autosave draft (debounced)
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        const payload = { caption, mediaList, audience, aiLabelEnabled, location }
        await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(payload))
        setHasDraft(true)
      } catch {}
    }, 500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [caption, mediaList, audience, aiLabelEnabled, location])

  const discardDraft = async () => {
    try { await AsyncStorage.removeItem(DRAFT_KEY) } catch {}
    setHasDraft(false)
    setCaption("")
    // Do not clear mediaList if user came from editor with selection
    if (!mediaData) setMediaList([])
  }

  const handleAddLocation = async () => {
    try {
      const place = await Location.reverseGeocodeAsync({ latitude: location?.lat || 0, longitude: location?.lng || 0 })
      const name = place?.[0]?.city || place?.[0]?.name || ""
      setLocation((prev) => ({ ...(prev || {}), name }))
      Alert.alert("Location", name ? `Using ${name}` : "Location set")
    } catch {
      Alert.alert("Location", "Unable to resolve location name")
    }
  }

  const handleAudiencePress = () => {
    Alert.alert("Audience", "Audience selection feature coming soon!")
  }

  const handleShareOnPress = () => {
    Alert.alert("Share On", "Platform sharing options coming soon!")
  }

  const handleShare = async () => {
    if (!caption.trim() && mediaList.length === 0) {
      Alert.alert("Error", "Please add a caption or select media to share")
      return
    }

    setIsPosting(true)
    setUploadProgress(0)

    try {
      const token = await getAuthToken()
      if (!token) {
        Alert.alert("Error", "Authentication required. Please log in again.")
        return
      }

      const { hashtags, mentions } = extractHashtagsAndMentions(caption)

      // Create FormData matching Postman structure
      const formData = new FormData()

      // Add media file if available
      if (mediaList.length > 0 && currentMedia) {
        const fileExtension = currentMedia.mediaType === "video" ? "mp4" : "jpg"
        const mimeType = currentMedia.mediaType === "video" ? "video/mp4" : "image/jpeg"

        formData.append("file", {
          uri: currentMedia.uri,
          type: mimeType,
          name: `post-media.${fileExtension}`,
        })
      }

      // Add title (first line of caption or default)
      const title = caption.trim().split("\n")[0] || "New Post"
      formData.append("title", title)

      // Add description (full caption)
      formData.append("description", caption.trim())

      // Add mentions as JSON string array
      formData.append("mentions", JSON.stringify(mentions))

      // Add hashtags as JSON string array
      formData.append("hashtags", JSON.stringify(hashtags))

      // Add location if available
      if (location?.name) formData.append("locationName", String(location.name))
      if (location?.lat != null) formData.append("lat", String(location.lat))
      if (location?.lng != null) formData.append("lng", String(location.lng))

      console.log("[v0] Creating post with FormData...")

      // Try up to 2 attempts
      let lastErr: any = null
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await createPost(formData, token)
          lastErr = null
          break
        } catch (e) {
          lastErr = e
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 800))
          }
        }
      }
      if (lastErr) throw lastErr

      console.log("[v0] Post created successfully")
      // Clear draft after successful post
      try { await AsyncStorage.removeItem(DRAFT_KEY); setHasDraft(false) } catch {}

      Alert.alert("Success", "Your post has been shared!", [
        {
          text: "OK",
          onPress: () => {
            router.push("/(tabs)")
          },
        },
      ])
    } catch (error) {
      console.error("[v0] Error sharing post:", error)
      Alert.alert("Error", (error as any)?.message || "Failed to share your post. Please try again.")
    } finally {
      setIsPosting(false)
      setUploadProgress(0)
    }
  }

  const handleBack = () => {
    router.back()
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New post</Text>
        {hasDraft ? (
          <TouchableOpacity onPress={discardDraft} style={styles.headerButton}>
            <Text style={{ color: '#ff3b30', fontWeight: '700' }}>Discard</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.mediaPreview}>
          {currentMedia ? (
            currentMedia.mediaType === "video" ? (
              <Video
                source={{ uri: currentMedia.uri }}
                style={styles.previewMedia}
                resizeMode="cover"
                shouldPlay={false}
                isLooping={false}
              />
            ) : (
              <Image source={{ uri: currentMedia.uri }} style={styles.previewMedia} resizeMode="cover" />
            )
          ) : (
            <View style={styles.previewPlaceholder}>
              <Ionicons name="image-outline" size={40} color="#aaa" />
              <Text style={{ color: "#777", marginTop: 6 }}>No media selected</Text>
            </View>
          )}
        </View>

        {!!isPosting && (
          <View style={{ marginHorizontal: 16, marginTop: 8, backgroundColor: "#f1f5f9", height: 8, borderRadius: 999 }}>
            <View
              style={{ height: 8, borderRadius: 999, width: `${Math.min(100, Math.max(0, uploadProgress))}%`, backgroundColor: "#0ea5e9" }}
            />
          </View>
        )}

        <View style={styles.form}>
          <TextInput
            style={styles.captionInput}
            placeholder="Write a caption..."
            placeholderTextColor="#999"
            value={caption}
            onChangeText={setCaption}
            multiline
          />

          <View style={styles.optionsSection}>
            {compositionOptions.map((opt) => (
              <TouchableOpacity key={opt.id} style={styles.optionItem} onPress={opt.onPress} activeOpacity={0.7}>
                <Ionicons name={opt.icon as any} size={20} color="#333" />
                <Text style={styles.optionText}>{opt.label}</Text>
                <Text style={styles.optionValue}>{opt.value || ""}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>AI labels</Text>
            <Switch value={aiLabelEnabled} onValueChange={setAiLabelEnabled} />
          </View>

          <View style={styles.row}>
            <TouchableOpacity onPress={handleAudiencePress} style={styles.rowButton}>
              <Ionicons name="people-outline" size={18} color="#555" />
              <Text style={styles.rowButtonText}>Audience: {audience}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleShareOnPress} style={styles.rowButton}>
              <Ionicons name="share-social-outline" size={18} color="#555" />
              <Text style={styles.rowButtonText}>Share on</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.shareButton, isPosting && { opacity: 0.7 }]} disabled={isPosting} onPress={handleShare}>
            <Text style={styles.shareButtonText}>{isPosting ? `Uploading ${uploadProgress}%` : "Share"}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  content: { flex: 1 },
  mediaPreview: { height: height * 0.45, backgroundColor: "#f5f5f5" },
  previewMedia: { width: "100%", height: "100%" },
  previewPlaceholder: { flex: 1, justifyContent: "center", alignItems: "center" },
  form: { padding: 16 },
  captionInput: { minHeight: 80, borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 12, fontSize: 16, textAlignVertical: "top" },
  optionsSection: { marginTop: 10, borderTopWidth: 1, borderTopColor: "#eee" },
  optionItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 10 },
  optionText: { fontSize: 16, color: "#333", flex: 1 },
  optionValue: { fontSize: 14, color: "#666" },
  switchRow: { marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLabel: { fontSize: 16, color: "#333" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  rowButton: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#f5f5f5", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  rowButtonText: { fontSize: 14, color: "#333" },
  shareButton: { marginTop: 16, backgroundColor: "#007AFF", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  shareButtonText: { color: "#fff", fontWeight: "800" },
})
