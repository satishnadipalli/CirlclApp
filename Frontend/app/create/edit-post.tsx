"use client"

import { Ionicons } from "@expo/vector-icons"
import { Video } from "expo-av"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useRef, useState } from "react"
import { Dimensions, Image, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native"

const { height, width } = Dimensions.get("window")

export default function EditPostScreen() {
    const router = useRouter()
    const { mediaData, postType } = useLocalSearchParams()
    const videoRef = useRef(null)

    const [selectedTool, setSelectedTool] = useState(null)
    const [mediaList, setMediaList] = useState(() => {
        try {
            return JSON.parse(mediaData)
        } catch {
            return []
        }
    })
    const [currentMediaIndex, setCurrentMediaIndex] = useState(0)

    const currentMedia = mediaList[currentMediaIndex]

    const editingTools = [
        { id: "audio", icon: "musical-notes-outline", label: "Audio" },
        { id: "text", icon: "text-outline", label: "Text" },
        { id: "overlay", icon: "layers-outline", label: "Overlay" },
        { id: "filter", icon: "color-filter-outline", label: "Filter" },
        { id: "edit", icon: "create-outline", label: "Edit" },
    ]

    const handleToolSelect = (toolId) => {
        setSelectedTool(toolId)
        // Here you would implement the specific tool functionality
        console.log(`Selected tool: ${toolId}`)
    }

    const handleNext = () => {
        router.push({
            pathname: "/create/compose-post",
            params: {
                mediaData: JSON.stringify(mediaList),
                postType: postType,
            },
        })
    }

    const handleBack = () => {
        router.back()
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#000" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={handleBack} style={styles.headerButton}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>New post</Text>
                <TouchableOpacity onPress={handleNext} style={styles.headerButton}>
                    <Text style={styles.nextButton}>Next</Text>
                </TouchableOpacity>
            </View>

            {/* Media Display Area */}
            <View style={styles.mediaContainer}>
                {currentMedia ? (
                    currentMedia.mediaType === "video" ? (
                        <Video
                            ref={videoRef}
                            source={{ uri: currentMedia.uri }}
                            style={styles.media}
                            resizeMode="contain"
                            shouldPlay={false}
                            isLooping
                            useNativeControls={false}
                        />
                    ) : (
                        <Image source={{ uri: currentMedia.uri }} style={styles.media} resizeMode="contain" />
                    )
                ) : (
                    <View style={styles.noMediaContainer}>
                        <Ionicons name="image-outline" size={60} color="#666" />
                        <Text style={styles.noMediaText}>No media selected</Text>
                    </View>
                )}

                {/* Media Navigation Dots (for multiple media) */}
                {mediaList.length > 1 && (
                    <View style={styles.mediaDots}>
                        {mediaList.map((_, index) => (
                            <TouchableOpacity
                                key={index}
                                style={[styles.dot, currentMediaIndex === index && styles.activeDot]}
                                onPress={() => setCurrentMediaIndex(index)}
                            />
                        ))}
                    </View>
                )}

                {/* Media Counter */}
                {mediaList.length > 1 && (
                    <View style={styles.mediaCounter}>
                        <Text style={styles.counterText}>
                            {currentMediaIndex + 1}/{mediaList.length}
                        </Text>
                    </View>
                )}

                {/* Play Button for Videos */}
                {currentMedia?.mediaType === "video" && (
                    <TouchableOpacity
                        style={styles.playButton}
                        onPress={() => {
                            if (videoRef.current) {
                                videoRef.current.playAsync()
                            }
                        }}
                    >
                        <Ionicons name="play" size={32} color="#fff" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Editing Tools */}
            <View style={styles.toolsContainer}>
                <View style={styles.toolsRow}>
                    {editingTools.map((tool) => (
                        <TouchableOpacity
                            key={tool.id}
                            style={[styles.toolButton, selectedTool === tool.id && styles.selectedTool]}
                            onPress={() => handleToolSelect(tool.id)}
                        >
                            <View style={styles.toolIconContainer}>
                                <Ionicons name={tool.icon} size={24} color={selectedTool === tool.id ? "#007AFF" : "#fff"} />
                            </View>
                            <Text style={[styles.toolLabel, selectedTool === tool.id && styles.selectedToolLabel]}>{tool.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Tool-specific options would go here */}
                {selectedTool && (
                    <View style={styles.toolOptions}>
                        <Text style={styles.toolOptionsText}>
                            {selectedTool.charAt(0).toUpperCase() + selectedTool.slice(1)} options will appear here
                        </Text>
                    </View>
                )}
            </View>
        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#000",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: "#000",
        paddingTop: 50
    },
    headerButton: {
        minWidth: 50,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: "600",
        color: "#fff",
    },
    nextButton: {
        fontSize: 16,
        fontWeight: "600",
        color: "#007AFF",
        textAlign: "right",
    },
    mediaContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
    },
    media: {
        width: width,
        height: "100%",
    },
    noMediaContainer: {
        justifyContent: "center",
        alignItems: "center",
    },
    noMediaText: {
        color: "#666",
        fontSize: 16,
        marginTop: 8,
    },
    mediaDots: {
        position: "absolute",
        bottom: 20,
        flexDirection: "row",
        gap: 8,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: "rgba(255,255,255,0.5)",
    },
    activeDot: {
        backgroundColor: "#fff",
    },
    mediaCounter: {
        position: "absolute",
        top: 20,
        right: 20,
        backgroundColor: "rgba(0,0,0,0.7)",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    counterText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "500",
    },
    playButton: {
        position: "absolute",
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: "rgba(0,0,0,0.7)",
        justifyContent: "center",
        alignItems: "center",
    },
    toolsContainer: {
        backgroundColor: "#000",
        paddingTop: 20,
        paddingBottom: 40,
    },
    toolsRow: {
        flexDirection: "row",
        justifyContent: "space-around",
        paddingHorizontal: 20,
    },
    toolButton: {
        alignItems: "center",
        flex: 1,
    },
    selectedTool: {
        // Add any selected state styling if needed
    },
    toolIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "rgba(255,255,255,0.1)",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 8,
    },
    toolLabel: {
        fontSize: 12,
        color: "#fff",
        fontWeight: "500",
    },
    selectedToolLabel: {
        color: "#007AFF",
    },
    toolOptions: {
        marginTop: 20,
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: "rgba(255,255,255,0.05)",
        marginHorizontal: 20,
        borderRadius: 12,
    },
    toolOptionsText: {
        color: "#fff",
        fontSize: 14,
        textAlign: "center",
    },
})
