"use client"

import { Ionicons } from "@expo/vector-icons"
import { Video } from "expo-av"
import { Camera } from "expo-camera"
import * as MediaLibrary from "expo-media-library"
import { useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import {
  Dimensions,
  FlatList,
  Image,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native"

const { height, width } = Dimensions.get("window")

export default function SelectMediaScreen() {
  const router = useRouter()
  const cameraRef = useRef < Camera > null

  const [media, setMedia] = useState([])
  const [selectedMedia, setSelectedMedia] = useState([])
  const [currentSelected, setCurrentSelected] = useState(null)
  const [multipleSelect, setMultipleSelect] = useState(false)
  const [cameraPermission, setCameraPermission] = useState(false)
  const [galleryPermission, setGalleryPermission] = useState(false)
  const [postType, setPostType] = useState("POST")

  // Request permissions and load media
  useEffect(() => {
    ; (async () => {
      const { status: cameraStatus } = await Camera.requestCameraPermissionsAsync()
      setCameraPermission(cameraStatus === "granted")

      const { status: galleryStatus } = await MediaLibrary.requestPermissionsAsync()
      setGalleryPermission(galleryStatus === "granted")

      if (galleryStatus === "granted") {
        const assets = await MediaLibrary.getAssetsAsync({
          first: 100,
          mediaType: ["photo", "video"],
          sortBy: ["creationTime"],
        })
        setMedia(assets.assets)
        if (assets.assets.length > 0) {
          setCurrentSelected(assets.assets[0])
        }
      }
    })()
  }, [])

  const handleMediaSelect = (item) => {
    if (multipleSelect) {
      const isSelected = selectedMedia.find((media) => media.id === item.id)
      if (isSelected) {
        setSelectedMedia(selectedMedia.filter((media) => media.id !== item.id))
      } else {
        setSelectedMedia([...selectedMedia, item])
      }
    } else {
      setCurrentSelected(item)
      setSelectedMedia([item])
    }
  }

  const handleNext = () => {
    const mediaToPass = multipleSelect ? selectedMedia : [currentSelected]
    router.push({
      pathname: "/create/edit-post",
      params: {
        mediaData: JSON.stringify(mediaToPass),
        postType: postType,
      },
    })
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New post</Text>
        <TouchableOpacity onPress={handleNext} disabled={!currentSelected && selectedMedia.length === 0}>
          <Text
            style={[styles.nextButton, !currentSelected && selectedMedia.length === 0 && styles.nextButtonDisabled]}
          >
            Next
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.previewContainer}>
        {currentSelected ? (
          currentSelected.mediaType === "video" ? (
            <Video
              source={{ uri: currentSelected.uri }}
              style={styles.previewMedia}
              resizeMode="cover"
              shouldPlay={false}
              isLooping
            />
          ) : (
            <Image source={{ uri: currentSelected.uri }} style={styles.previewMedia} resizeMode="cover" />
          )
        ) : (
          <View style={styles.noMediaContainer}>
            <Ionicons name="image-outline" size={60} color="#ccc" />
            <Text style={styles.noMediaText}>Select a photo or video</Text>
          </View>
        )}

        <View style={styles.mediaControls}>
          <TouchableOpacity style={styles.controlButton}>
            <Ionicons name="expand-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlButton} onPress={() => setMultipleSelect(!multipleSelect)}>
            <Ionicons name={multipleSelect ? "copy" : "copy-outline"} size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.recentsHeader}>
        <TouchableOpacity style={styles.recentsDropdown}>
          <Text style={styles.recentsText}>Recents</Text>
          <Ionicons name="chevron-down" size={16} color="#000" />
        </TouchableOpacity>

        {multipleSelect && (
          <TouchableOpacity style={styles.selectMultipleButton} onPress={() => setMultipleSelect(!multipleSelect)}>
            <Ionicons name="checkmark-circle" size={16} color="#007AFF" />
            <Text style={styles.selectMultipleText}>SELECT MULTIPLE</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={media}
        keyExtractor={(item) => item.id}
        numColumns={4}
        style={styles.mediaGrid}
        renderItem={({ item, index }) => {
          const isSelected = multipleSelect
            ? selectedMedia.find((media) => media.id === item.id)
            : currentSelected?.id === item.id

          return (
            <TouchableOpacity style={styles.mediaItem} onPress={() => handleMediaSelect(item)}>
              <Image source={{ uri: item.uri }} style={[styles.mediaImage, isSelected && styles.selectedMediaImage]} />

              {/* Video duration indicator */}
              {item.mediaType === "video" && (
                <View style={styles.videoDuration}>
                  <Ionicons name="play" size={12} color="#fff" />
                  <Text style={styles.durationText}>
                    {Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, "0")}
                  </Text>
                </View>
              )}

              {/* Selection indicator */}
              {multipleSelect && (
                <View style={styles.selectionIndicator}>
                  {isSelected ? (
                    <View style={styles.selectedCircle}>
                      <Text style={styles.selectionNumber}>
                        {selectedMedia.findIndex((media) => media.id === item.id) + 1}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.unselectedCircle} />
                  )}
                </View>
              )}
            </TouchableOpacity>
          )
        }}
      />

      <View style={styles.bottomNav}>
        {["POST", "MESSAGE", "STORY"].map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.navButton, postType === type && styles.activeNavButton]}
            onPress={() => setPostType(type)}
          >
            <Text style={[styles.navButtonText, postType === type && styles.activeNavButtonText]}>{type}</Text>
          </TouchableOpacity>
        ))}
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
    borderBottomWidth: 0.5,
    borderBottomColor: "#e0e0e0",
    paddingTop: 50
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
  },
  nextButton: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
  },
  nextButtonDisabled: {
    color: "#ccc",
  },
  previewContainer: {
    height: height * 0.4,
    backgroundColor: "#000",
    position: "relative",
  },
  previewMedia: {
    width: "100%",
    height: "100%",
  },
  noMediaContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  noMediaText: {
    color: "#ccc",
    fontSize: 16,
    marginTop: 8,
  },
  mediaControls: {
    position: "absolute",
    bottom: 16,
    right: 16,
    flexDirection: "row",
    gap: 12,
  },
  controlButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  recentsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e0e0e0",
  },
  recentsDropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  recentsText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  selectMultipleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  selectMultipleText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#007AFF",
  },
  mediaGrid: {
    flex: 1,
  },
  mediaItem: {
    width: width / 4,
    height: width / 4,
    position: "relative",
  },
  mediaImage: {
    width: "100%",
    height: "100%",
    borderWidth: 1,
    borderColor: "#fff",
  },
  selectedMediaImage: {
    borderColor: "#007AFF",
    borderWidth: 2,
  },
  videoDuration: {
    position: "absolute",
    bottom: 4,
    right: 4,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 2,
  },
  durationText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "500",
  },
  selectionIndicator: {
    position: "absolute",
    top: 4,
    right: 4,
  },
  selectedCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },
  selectionNumber: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  unselectedCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  bottomNav: {
    flexDirection: "row",
    borderTopWidth: 0.5,
    borderTopColor: "#e0e0e0",
    backgroundColor: "#fff",
  },
  navButton: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
  },
  activeNavButton: {
    borderBottomWidth: 2,
    borderBottomColor: "#000",
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
  },
  activeNavButtonText: {
    color: "#000",
    fontWeight: "600",
  },
})
