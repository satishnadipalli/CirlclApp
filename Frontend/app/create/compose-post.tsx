"use client"

import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { Video } from "expo-av"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useState } from "react"
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

const API_BASE_URL = "http://192.168.104.127:5000/api"

export default function ComposePostScreen() {
  const router = useRouter()
  const { mediaData, postType } = useLocalSearchParams()

  const [caption, setCaption] = useState("")
  const [selectedMusic, setSelectedMusic] = useState(null)
  const [taggedPeople, setTaggedPeople] = useState([])
  const [location, setLocation] = useState(null)
  const [aiLabelEnabled, setAiLabelEnabled] = useState(false)
  const [audience, setAudience] = useState("Everyone")
  const [shareOnPlatforms, setShareOnPlatforms] = useState([])
  const [isPosting, setIsPosting] = useState(false)

  const [mediaList, setMediaList] = useState(() => {
    try {
      return JSON.parse(mediaData)
    } catch {
      return []
    }
  })

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
      const response = await fetch(`${API_BASE_URL}/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          // Note: Don't set Content-Type for FormData, let the browser set it
        },
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
    {
      id: "music",
      icon: "musical-notes-outline",
      label: "Add music",
      value: selectedMusic?.name || null,
      onPress: () => handleAddMusic(),
    },
    {
      id: "tag",
      icon: "person-outline",
      label: "Tag people",
      value: taggedPeople.length > 0 ? `${taggedPeople.length} people` : null,
      onPress: () => handleTagPeople(),
    },
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

  const handleAddLocation = () => {
    // Navigate to location selection screen
    Alert.alert("Add Location", "Location selection feature coming soon!")
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

      console.log("[v0] Creating post with FormData...")

      const createdPost = await createPost(formData, token)

      console.log("[v0] Post created successfully:", createdPost)

      Alert.alert("Success", "Your post has been shared!", [
        {
          text: "OK",
          onPress: () => {
            router.push("/(tabs)/home")
          },
        },
      ])
    } catch (error) {
      console.error("[v0] Error sharing post:", error)
      Alert.alert("Error", error.message || "Failed to share your post. Please try again.")
    } finally {
      setIsPosting(false)
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
        <View style={styles.headerButton} />
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
            <View style={styles.noMediaPreview}>
              <Ionicons name="image-outline" size={40} color="#ccc" />
            </View>
          )}

          {mediaList.length > 1 && (
            <View style={styles.mediaCount}>
              <Text style={styles.mediaCountText}>1/{mediaList.length}</Text>
            </View>
          )}
        </View>

        <View style={styles.captionContainer}>
          <TextInput
            style={styles.captionInput}
            placeholder="Add a caption..."
            placeholderTextColor="#999"
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={2200}
            textAlignVertical="top"
          />
          <Text style={styles.characterCount}>{caption.length}/2200</Text>
        </View>

        <View style={styles.optionsContainer}>
          {compositionOptions.map((option) => (
            <TouchableOpacity key={option.id} style={styles.optionRow} onPress={option.onPress}>
              <View style={styles.optionLeft}>
                <Ionicons name={option.icon} size={24} color="#000" />
                <Text style={styles.optionLabel}>{option.label}</Text>
              </View>
              <View style={styles.optionRight}>
                {option.value && <Text style={styles.optionValue}>{option.value}</Text>}
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </View>
            </TouchableOpacity>
          ))}

          <View style={styles.optionRow}>
            <View style={styles.optionLeft}>
              <Ionicons name="sparkles-outline" size={24} color="#000" />
              <View style={styles.aiLabelContainer}>
                <Text style={styles.optionLabel}>Add AI label</Text>
                <Text style={styles.aiLabelDescription}>
                  We require you to label certain realistic content that's made with AI. Learn more
                </Text>
              </View>
            </View>
            <Switch
              value={aiLabelEnabled}
              onValueChange={setAiLabelEnabled}
              trackColor={{ false: "#e0e0e0", true: "#007AFF" }}
              thumbColor="#fff"
            />
          </View>

          <TouchableOpacity style={styles.optionRow} onPress={handleAudiencePress}>
            <View style={styles.optionLeft}>
              <Ionicons name="people-outline" size={24} color="#000" />
              <Text style={styles.optionLabel}>Audience</Text>
            </View>
            <View style={styles.optionRight}>
              <Text style={styles.optionValue}>{audience}</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.optionRow} onPress={handleShareOnPress}>
            <View style={styles.optionLeft}>
              <Ionicons name="share-outline" size={24} color="#000" />
              <Text style={styles.optionLabel}>Also share on...</Text>
            </View>
            <View style={styles.optionRight}>
              <Text style={styles.optionValue}>Satish Nadipalli</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.shareContainer}>
        <TouchableOpacity
          style={[styles.shareButton, isPosting && styles.shareButtonDisabled]}
          onPress={handleShare}
          disabled={isPosting}
        >
          <Text style={styles.shareButtonText}>{isPosting ? "Sharing..." : "Share"}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 50,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e0e0e0",
  },
  headerButton: {
    minWidth: 50,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
  },
  content: {
    flex: 1,
  },
  mediaPreview: {
    width: 120,
    height: 120,
    margin: 16,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  previewMedia: {
    width: "100%",
    height: "100%",
  },
  noMediaPreview: {
    width: "100%",
    height: "100%",
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
    alignItems: "center",
  },
  mediaCount: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
  },
  mediaCountText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
  },
  captionContainer: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  captionInput: {
    fontSize: 16,
    color: "#000",
    minHeight: 80,
    textAlignVertical: "top",
    paddingVertical: 0,
  },
  characterCount: {
    fontSize: 12,
    color: "#999",
    textAlign: "right",
    marginTop: 8,
  },
  optionsContainer: {
    paddingHorizontal: 16,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    color: "#000",
    marginLeft: 12,
  },
  optionRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  optionValue: {
    fontSize: 16,
    color: "#999",
    marginRight: 8,
  },
  aiLabelContainer: {
    marginLeft: 12,
    flex: 1,
  },
  aiLabelDescription: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
    lineHeight: 16,
  },
  shareContainer: {
    padding: 16,
    borderTopWidth: 0.5,
    borderTopColor: "#e0e0e0",
  },
  shareButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  shareButtonDisabled: {
    backgroundColor: "#ccc",
  },
  shareButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
})
