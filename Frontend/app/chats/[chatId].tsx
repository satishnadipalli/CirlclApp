"use client"

import { apiService } from "@/services/api.service"
import { socketService } from "@/services/socket.service"
import type { ChatParams, Group, TypingUser, User } from "@/types/chat.types"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import {
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,

  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  StatusBar,
} from "react-native"
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { Video as ExpoVideo } from 'expo-av'
import { Audio } from 'expo-av'

import { Avatar } from "react-native-paper"
import Icon from "react-native-vector-icons/MaterialIcons"

interface ChatMessage {
  id: string
  text: string
  sender: "me" | "other"
  from: User
  to?: User
  group?: string
  messageType: "direct" | "group"
  createdAt?: string
  replyTo?: ChatMessage
  system?: boolean
  attachments?: Array<{ url: string; type: 'image' | 'video' | 'file'; name?: string }>
  reactions?: Array<{ type: string; userId: string }>
  readBy?: string[]
  edited?: boolean
}

interface DateHeader {
  id: string
  type: "date"
  date: string
  displayText: string
}

interface SystemChipItem {
  id: string
  type: "system"
  text: string
  createdAt?: string
}

type ChatItem = ChatMessage | DateHeader | SystemChipItem

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatItems, setChatItems] = useState<ChatItem[]>([])
  const [inputText, setInputText] = useState("")
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [otherUser, setOtherUser] = useState<User | null>(null)
  const [group, setGroup] = useState<Group | null>(null)
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const [isUserAtBottom, setIsUserAtBottom] = useState(true)
  const [showGroupInfo, setShowGroupInfo] = useState(false)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [newMessagesCount, setNewMessagesCount] = useState(0)
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null)

  const flatListRef = useRef<FlatList>(null)
  const socketRef = useRef<any>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const currentUserRef = useRef<User | null>(null)
  const otherUserRef = useRef<User | null>(null)
  const groupRef = useRef<Group | null>(null)
  const messageListenerRef = useRef<((msg: any) => void) | null>(null)
  const typingListenerRef = useRef<((data: any) => void) | null>(null)
  const stopTypingListenerRef = useRef<((data: any) => void) | null>(null)
  const userStatusListenerRef = useRef<((data: any) => void) | null>(null)
  const reactionListenerRef = useRef<((payload: any) => void) | null>(null)
  const deleteListenerRef = useRef<((payload: any) => void) | null>(null)
  const editListenerRef = useRef<((payload: any) => void) | null>(null)
  const readListenerRef = useRef<((payload: any) => void) | null>(null)
  const isUserAtBottomRef = useRef<boolean>(true)
  const router = useRouter()
  const params = useLocalSearchParams() as unknown as ChatParams

  const dot1Opacity = useRef(new Animated.Value(0.3)).current
  const dot2Opacity = useRef(new Animated.Value(0.3)).current
  const dot3Opacity = useRef(new Animated.Value(0.3)).current

  const [mediaViewer, setMediaViewer] = useState<{ visible: boolean; url: string; type: 'image' | 'video' | 'file' }>({ visible: false, url: '', type: 'image' })

  console.log("params",params);


  const loadUserAndInitialize = async () => {
    try {
      const [userData, token] = await Promise.all([AsyncStorage.getItem("user"), AsyncStorage.getItem("token")])

      if (userData) {
        const parsedUser = JSON.parse(userData);
        console.log("parsed user",parsedUser)
        const formattedUser: User = {
          _id: parsedUser.id,
          name: parsedUser.name,
          profilePic: parsedUser.profilePic || "",
        }
        setCurrentUser(formattedUser)
        currentUserRef.current = formattedUser

        setAuthToken(token)
        if (token) {
          apiService.setToken(token)
        }

        // Seed other user (for brand new chats with no history yet)
        if (params.chatType === "direct" && params.chatId) {
          const seededOther: User = {
            _id: params.chatId,
            name: (params as any).name || "",
            profilePic: params?.profilePic,
          }
          setOtherUser((prev) => prev ?? seededOther)
          otherUserRef.current = seededOther
        }

        await initializeSocket(formattedUser)
        await loadChatData(formattedUser)
      }
    } catch (error) {
      console.error("[v0] Error loading user data:", error)
      Alert.alert("Error", "Please login again")
    }
  }

  // Keep refs in sync with latest state for use inside socket callbacks
  useEffect(() => {
    currentUserRef.current = currentUser
  }, [currentUser])

  useEffect(() => {
    otherUserRef.current = otherUser
  }, [otherUser])

  useEffect(() => {
    groupRef.current = group
  }, [group])

  const resolveFromUser = (rawFrom: any): User => {
    const fromId = typeof rawFrom === "object" ? rawFrom._id : rawFrom
    const me = currentUserRef.current
    const other = otherUserRef.current
    const grp = groupRef.current

    if (me && fromId === me._id) return me

    if (params.chatType === "direct") {
      if (other && fromId === other._id) return other
      if (fromId === params.chatId) {
        return {
          _id: params.chatId,
          name: (params as any).chatName || other?.name || "",
          profilePic: other?.profilePic || "",
        } as User
      }
    } else if (grp?.members) {
      const member = grp.members.find((m) => m._id === fromId)
      if (member) return member
    }

    if (typeof rawFrom === "object") return rawFrom as User
    return { _id: fromId, name: "", profilePic: "" } as User
  }

  const initializeSocket = async (user: User) => {
    try {
      // await socketService.connect()
      setIsConnected(true)

      console.log("[v0] Socket initialized for user:", user._id)

      socketService.registerUser(user._id)

      const onMessageCb = (msg: any) => {
        console.log("[v0] Received socket message:", msg)

        const fromUserId = typeof msg.from === "object" ? msg.from._id : msg.from
        const toUserId = typeof msg.to === "object" ? msg.to._id : msg.to
        const groupId = typeof msg.group === "object" ? msg.group?._id : msg.group

        // Only accept messages that belong to this conversation
        const isRelevantMessage =
          params.chatType === "direct"
            ? ((fromUserId === user._id && toUserId === params.chatId) ||
              (fromUserId === params.chatId && toUserId === user._id))
            : groupId === params.chatId

        if (isRelevantMessage) {
          const baseMessage: ChatMessage = {
            id: msg._id || `socket-${Date.now()}-${Math.random()}`,
            text: msg.text,
            sender: fromUserId === user._id ? "me" : "other",
            from: resolveFromUser(msg.from),
            to: msg.to,
            group: msg.group,
            messageType: params.chatType,
            createdAt: msg.createdAt || new Date().toISOString(),
            system: /\badded\b/i.test(String(msg.text || "")),
            attachments: msg.attachments,
          }

          // Mark as read immediately when a new incoming message arrives while viewing this conversation
          if (fromUserId !== user._id) {
            if (params.chatType === "direct") {
              try { apiService.markDirectRead(params.chatId) } catch {}
            } else {
              try { apiService.markGroupRead(params.chatId) } catch {}
            }
          }

          setMessages((prev) => {
            let newMessage = baseMessage
            // If server-sent id already exists, replace in-place
            const byId = prev.findIndex((m) => m.id === newMessage.id)
            if (byId > -1) {
              const next = [...prev]
              next[byId] = newMessage
              return next
            }

            // Link reply if present and known
            if (msg.replyTo) {
              const replyId = typeof msg.replyTo === "object" ? msg.replyTo._id : msg.replyTo
              const replied = prev.find((m) => m.id === replyId)
              if (replied) {
                newMessage = { ...newMessage, replyTo: replied as any }
              }
            }

            // If this is my own message, replace a matching temp message instead of appending
            if (fromUserId === user._id) {
              const newToId = typeof (newMessage as any).to === 'object' ? (newMessage as any).to?._id : (newMessage as any).to
              const newGroupId = typeof (newMessage as any).group === 'object' ? (newMessage as any).group?._id : (newMessage as any).group
              const revIdx = [...prev].reverse().findIndex((m) => {
                const mToId = typeof (m as any).to === 'object' ? (m as any).to?._id : (m as any).to
                const mGroupId = typeof (m as any).group === 'object' ? (m as any).group?._id : (m as any).group
                return (
                  m.sender === 'me' &&
                  String((m as any).id || '').startsWith('temp-') &&
                  (m as any).text === (newMessage as any).text &&
                  (m as any).messageType === (newMessage as any).messageType &&
                  (newGroupId ? mGroupId === newGroupId : true) &&
                  (newToId ? mToId === newToId : true) &&
                  Math.abs(new Date((m as any).createdAt || 0).getTime() - new Date((newMessage as any).createdAt || 0).getTime()) < 15000
                )
              })
              if (revIdx > -1) {
                const idx = prev.length - 1 - revIdx
                const next = [...prev]
                next[idx] = newMessage
                return next
              }
            }

            const nextMessages = [...prev, newMessage].sort(
              (a, b) => new Date(a.createdAt || "").getTime() - new Date(b.createdAt || "").getTime(),
            )

            if (!isUserAtBottomRef.current && newMessage.sender !== "me") {
              setNewMessagesCount((c) => c + 1)
              setShowScrollToBottom(true)
            }

            return nextMessages
          })
        }
      }
      socketService.onMessage(onMessageCb)
      messageListenerRef.current = onMessageCb

      const onReactions = (payload: any) => {
        setMessages((prev) => prev.map((m) => (m.id === String(payload?._id) ? ({ ...(m as any), reactions: payload.reactions } as any) : m)))
      }
      socketService.onMessageReactionsUpdated(onReactions)
      reactionListenerRef.current = onReactions

      const onDeleted = (payload: any) => {
        setMessages((prev) => prev.filter((m) => m.id !== String(payload?._id)))
      }
      socketService.onMessageDeleted(onDeleted)
      deleteListenerRef.current = onDeleted

      const onEdited = (payload: any) => {
        setMessages((prev) => prev.map((m) => (m.id === String(payload?._id) ? ({ ...(m as any), text: payload.text, edited: true } as any) : m)))
      }
      socketService.onMessageEdited(onEdited)
      editListenerRef.current = onEdited

      const onRead = (payload: any) => {
        if (params.chatType === 'direct' && payload?.chatType === 'direct') {
          // mark all messages from me to peer as read
          setMessages((prev) => prev.map((m) => (m.sender === 'me' ? ({ ...(m as any), readBy: [currentUser?._id, payload?.peerId].filter(Boolean) } as any) : m)))
        } else if (params.chatType === 'group' && payload?.chatType === 'group' && String(payload?.groupId) === String(params.chatId)) {
          setMessages((prev) => prev.map((m) => ({ ...(m as any), readBy: Array.isArray((m as any).readBy) ? Array.from(new Set([...(m as any).readBy, payload.readerId])) : [payload.readerId] } as any)))
        }
      }
      socketService.onMessagesRead(onRead)
      readListenerRef.current = onRead

      if (params.chatType === "direct") {
        const onTypingCb = (data: { from: string; name: string }) => {
          console.log("[v0] Received typing event:", data)
          const fromUserId = typeof data.from === "object" ? data.from._id : data.from
          if (fromUserId !== user._id) {
            setTypingUsers((prev) => {
              const exists = prev.find((user) => user._id === fromUserId)
              if (!exists) {
                console.log("[v0] Adding typing user:", data.name)
                startTypingAnimation()
                return [
                  ...prev,
                  {
                    _id: fromUserId,
                    name: data.name || otherUserRef.current?.name || (params as any).chatName || "Someone",
                  },
                ]
              }
              return prev
            })
          }
        }
        socketService.onTyping(onTypingCb)
        typingListenerRef.current = onTypingCb

        const onStopTypingCb = (data: { from: string }) => {
          console.log("[v0] Received stop typing event:", data)
          const fromUserId = typeof data.from === "object" ? data.from._id : data.from
          setTypingUsers((prev) => {
            const filtered = prev.filter((user) => user._id !== fromUserId)
            if (filtered.length === 0) {
              stopTypingAnimation()
            }
            return filtered
          })
        }
        socketService.onStopTyping(onStopTypingCb)
        stopTypingListenerRef.current = onStopTypingCb
      } else {
        const onGroupTypingCb = (data: { from: string; name: string }) => {
          console.log("[v0] Received group typing event:", data)
          const fromUserId = typeof data.from === "object" ? data.from._id : data.from
          if (fromUserId !== user._id) {
            setTypingUsers((prev) => {
              const exists = prev.find((user) => user._id === fromUserId)
              if (!exists) {
                console.log("[v0] Adding group typing user:", data.name)
                startTypingAnimation()
                return [
                  ...prev,
                  {
                    _id: fromUserId,
                    name: data.name || groupRef.current?.members.find((m) => m._id === fromUserId)?.name || "Someone",
                  },
                ]
              }
              return prev
            })
          }
        }
        socketService.onGroupTyping(onGroupTypingCb)
        typingListenerRef.current = onGroupTypingCb

        const onGroupStopTypingCb = (data: { from: string }) => {
          console.log("[v0] Received group stop typing event:", data)
          const fromUserId = typeof data.from === "object" ? data.from._id : data.from
          setTypingUsers((prev) => {
            const filtered = prev.filter((user) => user._id !== fromUserId)
            if (filtered.length === 0) {
              stopTypingAnimation()
            }
            return filtered
          })
        }
        socketService.onGroupStopTyping(onGroupStopTypingCb)
        stopTypingListenerRef.current = onGroupStopTypingCb
      }

      const onUserStatusChangeCb = (data: { userId: string; status: "online" | "offline" }) => {
        console.log("[v0] User status change:", data)
        setOnlineUsers((prev) => {
          const newSet = new Set(prev)
          if (data.status === "online") {
            newSet.add(data.userId)
          } else {
            newSet.delete(data.userId)
          }
          return newSet
        })
      }
      socketService.onUserStatusChange(onUserStatusChangeCb)
      userStatusListenerRef.current = onUserStatusChangeCb

      if (params.chatType === "group") {
        console.log("[v0] Joining group:", params.chatId)
        socketService.joinGroup(params.chatId)
      }
    } catch (error) {
      console.error("[v0] Socket connection error:", error)
      setIsConnected(false)
    }
  }

  const loadChatData = async (user: User) => {
    try {
      if (params.chatType === "direct") {
        const response = await apiService.getDirectMessages(params.chatId)
        if (response.success) {
          const formattedMessages: ChatMessage[] = response.messages.map((msg: any) => ({
            id: msg._id,
            text: msg.text,
            sender: msg.from._id === user._id ? "me" : "other",
            from: msg.from,
            to: msg.to,
            messageType: "direct",
            createdAt: msg.createdAt,
            attachments: msg.attachments,
          }))
          console.log("[v0] Loaded direct messages:", formattedMessages.length)
          setMessages(formattedMessages)

          // Mark as read
          try { await apiService.markDirectRead(params.chatId) } catch {}

          const firstMessage = response.messages[0]
          if (firstMessage) {
            const otherUserData = firstMessage.from._id === user._id ? firstMessage.to : firstMessage.from
            setOtherUser(otherUserData)
          }
        }
      } else {
        const [messagesResponse, groupResponse] = await Promise.all([
          apiService.getGroupMessages(params.chatId),
          apiService.getGroupInfo(params.chatId),
        ])

        if (messagesResponse.success) {
          const formattedMessages: ChatMessage[] = messagesResponse.messages.map((msg: any) => ({
            id: msg._id,
            text: msg.text,
            sender: msg.from._id === user._id ? "me" : "other",
            from: msg.from,
            group: msg.group,
            messageType: "group",
            createdAt: msg.createdAt,
            system: /\badded\b/i.test(String(msg.text || "")),
            attachments: msg.attachments,
          }))
          console.log("[v0] Loaded group messages:", formattedMessages.length)
          setMessages(formattedMessages)

          // Mark as read for group
          try { await apiService.markGroupRead(params.chatId) } catch {}
        }

        if (groupResponse.success) {
          setGroup(groupResponse.group)
        }
      }
    } catch (error) {
      console.error("Error loading chat data:", error)
      Alert.alert("Error", "Failed to load chat data")
    } finally {
      setIsLoading(false)
    }
  }

  const startTypingAnimation = () => {
    const animateDot = (dotOpacity: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dotOpacity, {
            toValue: 1,
            duration: 600,
            delay,
            useNativeDriver: true,
          }),
          Animated.timing(dotOpacity, {
            toValue: 0.3,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      ).start()
    }

    animateDot(dot1Opacity, 0)
    animateDot(dot2Opacity, 200)
    animateDot(dot3Opacity, 400)
  }

  const stopTypingAnimation = () => {
    dot1Opacity.stopAnimation()
    dot2Opacity.stopAnimation()
    dot3Opacity.stopAnimation()
    dot1Opacity.setValue(0.3)
    dot2Opacity.setValue(0.3)
    dot3Opacity.setValue(0.3)
  }

  const handleTextChange = (text: string) => {
    setInputText(text)

    if (currentUser) {
      if (params.chatType === "direct") {
        socketService.sendTyping(params.chatId, currentUser._id, currentUser.name)
      } else {
        socketService.sendGroupTyping(params.chatId, currentUser._id, currentUser.name)
      }

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }

      typingTimeoutRef.current = setTimeout(() => {
        if (params.chatType === "direct") {
          socketService.sendStopTyping(params.chatId, currentUser._id)
        } else {
          socketService.sendGroupStopTyping(params.chatId, currentUser._id)
        }
      }, 1000)
    }
  }

  const sendMessage = async () => {
    if (!inputText.trim() || !currentUser) return

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    if (params.chatType === "direct") {
      socketService.sendStopTyping(params.chatId, currentUser._id)
    } else {
      socketService.sendGroupStopTyping(params.chatId, currentUser._id)
    }

    const messageText = inputText.trim()
    setInputText("")
    const tempMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      text: messageText,
      sender: "me",
      from: currentUser,
      to: params.chatType === "direct" ? ({ _id: params.chatId } as User) : undefined,
      group: params.chatType === "group" ? params.chatId : undefined,
      messageType: params.chatType,
      createdAt: new Date().toISOString(),
      replyTo: replyingTo || undefined,
    }
    setMessages((prev) => [...prev, tempMessage])

    console.log("[v0] Sending socket message:", messageText)
    if (params.chatType === "direct") {
      socketService.sendDirectMessage(params.chatId, messageText, replyingTo?.id)
    } else {
      socketService.sendGroupMessage(params.chatId, messageText, replyingTo?.id)
    }

    try {
      let response
      if (params.chatType === "direct") {
        response = await apiService.sendDirectMessage(params.chatId, messageText, replyingTo?.id)
      } else {
        response = await apiService.sendGroupMessage(params.chatId, messageText, replyingTo?.id)
      }

      if (!response.success) {
        console.error("[v0] API send message failed:", response)
        Alert.alert("Error", "Failed to send message. Please try again.")
      } else {
        console.log("[v0] Message sent successfully via API")
      }
    } catch (error) {
      console.error("[v0] Error sending message via API:", error)
      Alert.alert("Error", "Failed to send message. Please try again.")
    }
    setReplyingTo(null)
  }

  const sendAttachment = async (assets: Array<{ uri: string; type?: string; name?: string }>) => {
    try {
      if (!currentUser || assets.length === 0) return
      const token = await AsyncStorage.getItem('token')
      const form = new FormData()
      form.append('messageType', params.chatType as any)
      if (params.chatType === 'direct') form.append('to', String(params.chatId))
      else form.append('group', String(params.chatId))
      if (replyingTo?.id) form.append('replyTo', String(replyingTo.id))
      for (const a of assets) {
        const isVid = /\.(mp4|mov|m4v|webm)$/i.test(a.name || a.uri)
        const mime = a.type || (isVid ? 'video/mp4' : 'image/jpeg')
        form.append('files', { uri: a.uri as any, name: a.name || (isVid ? 'video.mp4' : 'image.jpg'), type: mime } as any)
      }

      // Track progress
      try {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open('POST', require('@/constants/Config').API_BASE_URL + '/messages')
          xhr.setRequestHeader('Authorization', `Bearer ${token}`)
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100)
              // Optionally update some local UI state if desired
            }
          }
          xhr.onerror = () => reject(new Error('Network error'))
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve(true)
            else {
              try { reject(new Error(JSON.parse(xhr.responseText)?.message || 'Failed to send attachment')) }
              catch { reject(new Error('Failed to send attachment')) }
            }
          }
          xhr.send(form)
        })
      } catch (e) {
        throw e
      }

      setReplyingTo(null)
    } catch (e) {
      Alert.alert('Send failed', (e as Error).message)
    }
  }

  const onAttachPress = async () => {
    try {
      const choice = await new Promise<'gallery'|'file'|'voice'|'cancel'>((resolve) => {
        Alert.alert('Attach', 'Choose source', [
          { text: 'Gallery', onPress: () => resolve('gallery') },
          { text: 'File', onPress: () => resolve('file') },
          { text: 'Voice note', onPress: () => resolve('voice') },
          { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
        ])
      })
      if (choice === 'gallery') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (!perm.granted) return
        const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, allowsMultipleSelection: true, quality: 0.85 })
        if (!picked.canceled) {
          const assets = (picked.assets || []).slice(0, 8).map((a) => ({ uri: a.uri, name: a.fileName || a.uri.split('/').pop() || 'media' }))
          await sendAttachment(assets)
        }
      } else if (choice === 'file') {
        const picked = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true })
        if (picked.type === 'success') {
          const assets = [{ uri: picked.uri, name: picked.name }]
          await sendAttachment(assets)
        }
      } else if (choice === 'voice') {
        await recordAndSendVoiceNote()
      }
    } catch {}
  }

  const recordAndSendVoiceNote = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync()
      if (!(perm?.granted || perm?.status === 'granted')) {
        Alert.alert('Microphone', 'Recording permission is required')
        return
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: false, interruptionModeIOS: 1 as any, shouldDuckAndroid: true, interruptionModeAndroid: 1 as any, playThroughEarpieceAndroid: false })
      const rec = new Audio.Recording()
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
      await rec.startAsync()
      // Simple 3-second quick note. TODO: replace with hold-to-record UI.
      await new Promise((r) => setTimeout(r, 3000))
      await rec.stopAndUnloadAsync()
      const uri = rec.getURI()
      if (uri) {
        await sendAttachment([{ uri, name: 'voice-note.m4a', type: 'audio/m4a' }])
        Alert.alert('Voice note', 'Sent')
      } else {
        Alert.alert('Voice note', 'No audio captured')
      }
    } catch (e: any) {
      Alert.alert('Recording failed', e?.message || 'Unable to record audio')
    }
  }

  const isToday = (date: Date): boolean => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const isYesterday = (date: Date): boolean => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    return date.toDateString() === yesterday.toDateString()
  }

  const formatDate = (date: Date): string => {
    if (isToday(date)) return "Today"
    if (isYesterday(date)) return "Yesterday"

    const day = date.getDate().toString().padStart(2, "0")
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    const year = date.getFullYear()
    return `${day}-${month}-${year}`
  }

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  }

  const processMessagesWithDates = (messages: ChatMessage[]): ChatItem[] => {
    const items: ChatItem[] = []
    let lastDate = ""

    messages.forEach((message) => {
      if (message.createdAt) {
        const messageDate = new Date(message.createdAt)
        const currentDate = messageDate.toDateString()

        if (currentDate !== lastDate) {
          items.push({
            id: `date-${currentDate}`,
            type: "date",
            date: currentDate,
            displayText: formatDate(messageDate),
          })
          lastDate = currentDate
        }
      }
      items.push(message)
    })

    return items
  }

  useEffect(() => {
    // Interleave date headers and transform system messages into centered chips
    const withDates = processMessagesWithDates(messages)
    const processedItems: ChatItem[] = withDates.map((item) => {
      if ((item as any)?.system) {
        return {
          id: (item as any).id,
          type: "system",
          text: (item as any).text,
          createdAt: (item as any).createdAt || new Date().toISOString(),
        }
      }
      return item
    })
    setChatItems(processedItems)
  }, [messages])

  useEffect(() => {
    loadUserAndInitialize()

    return () => {
      // Only leave the group on unmount if this is a group chat
      if (params.chatType === "group" && socketService.isSocketConnected()) {
        socketService.leaveGroup(params.chatId)
        console.log("[v0] Left group on unmount:", params.chatId)
      }

      // Remove registered listeners to prevent duplicate callbacks when navigating back and forth
      if (messageListenerRef.current) socketService.removeMessageListener(messageListenerRef.current)
      if (typingListenerRef.current) socketService.removeTypingListener(typingListenerRef.current)
      if (stopTypingListenerRef.current) socketService.removeStopTypingListener(stopTypingListenerRef.current)
      if (userStatusListenerRef.current) socketService.removeUserStatusListener(userStatusListenerRef.current)
      if (reactionListenerRef.current) socketService.removeMessageReactionsUpdated(reactionListenerRef.current)
      if (deleteListenerRef.current) socketService.removeMessageDeleted(deleteListenerRef.current)
      if (editListenerRef.current) socketService.removeMessageEdited(editListenerRef.current)
      if (readListenerRef.current) socketService.removeMessagesRead(readListenerRef.current)

      // DO NOT disconnect socket here
      // socketService.disconnect()  // keep this commented
    }
  }, [])

  useEffect(() => {
    if (typingUsers.length > 0 && isUserAtBottom) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true })
      }, 100)
    }
  }, [typingUsers, isUserAtBottom])

  useEffect(() => {
    if (isUserAtBottom) {
      flatListRef.current?.scrollToEnd({ animated: true })
      setShowScrollToBottom(false)
      setNewMessagesCount(0)
    }
  }, [messages, isUserAtBottom])

  const handleScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    const isAtBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 50
    setIsUserAtBottom(isAtBottom)
    isUserAtBottomRef.current = isAtBottom
    if (isAtBottom) {
      setShowScrollToBottom(false)
      setNewMessagesCount(0)
      // Best-effort mark-as-read when user reaches bottom
      try {
        if (params.chatType === "direct") apiService.markDirectRead(params.chatId)
        else apiService.markGroupRead(params.chatId)
      } catch {}
    }
  }

  const getUserInitials = (name: string): string => {
    if (!name || typeof name !== "string") {
      return "??"
    }
    return name?.split(" ")?.map((word) => word.charAt(0))?.join("")?.substring(0, 2)?.toUpperCase()
  }

  const getUserColor = (userId: string): string => {
    const colors = [
      "#FF6B6B",
      "#4ECDC4",
      "#45B7D1",
      "#96CEB4",
      "#FFEAA7",
      "#DDA0DD",
      "#98D8C8",
      "#F7DC6F",
      "#BB8FCE",
      "#85C1E9",
    ]
    const index = userId?.split("")?.reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
    return colors[index]
  }

  const renderItem = ({ item }: { item: ChatItem }) => {
    if ("type" in item && item.type === "date") {
      return (
        <View style={styles.dateHeader}>
          <Text style={styles.dateHeaderText}>{item.displayText}</Text>
        </View>
      )
    }

    if ("type" in item && item.type === "system") {
      return (
        <View style={styles.systemChipContainer}>
          <View style={styles.systemChip}>
            <Text style={styles.systemChipText}>{item.text}</Text>
          </View>
        </View>
      )
    }

    const message = item as ChatMessage
    const messageTime = message.createdAt ? formatTime(new Date(message.createdAt)) : ""
    const isMyMessage = message.sender === "me"

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onLongPress={() => {
          const opts: any[] = [
            { text: '❤️', onPress: async () => { try { await apiService.request('/messages/'+message.id+'/react', { method:'POST', body: JSON.stringify({ type: '❤️' }) }) } catch {} } },
            { text: '😂', onPress: async () => { try { await apiService.request('/messages/'+message.id+'/react', { method:'POST', body: JSON.stringify({ type: '😂' }) }) } catch {} } },
            { text: '🔥', onPress: async () => { try { await apiService.request('/messages/'+message.id+'/react', { method:'POST', body: JSON.stringify({ type: '🔥' }) }) } catch {} } },
            { text: 'Reply', onPress: () => setReplyingTo(message) },
          ]
          if (isMyMessage) {
            opts.push({ text: 'Edit', onPress: async () => {
              try {
                const prompt = (global as any).prompt || (()=>null)
                const t = prompt ? prompt('Edit message', message.text || '') : ''
                if (typeof t === 'string') await apiService.request('/messages/'+message.id, { method:'PUT', body: JSON.stringify({ text: t }) })
              } catch {}
            } })
            opts.push({ text: 'Delete', style: 'destructive', onPress: async () => { try { await apiService.request('/messages/'+message.id, { method:'DELETE' }) } catch {} } })
          }
          opts.push({ text: 'Cancel', style: 'cancel' })
          Alert.alert('Message', 'Choose action', opts)
        }}
        style={[styles.messageRow, isMyMessage ? styles.myMessageRow : styles.otherMessageRow]}
      >
        {params.chatType === "group" && !isMyMessage && (
          <View style={styles.avatarContainer}>
            {message.from.profilePic ? (
              <Avatar.Image size={32} source={{ uri: message.from.profilePic }} />
            ) : (
              <View style={[styles.initialsAvatar, { backgroundColor: getUserColor(message.from._id) }]}>
                <Text style={styles.initialsText}>{getUserInitials(message.from.name)}</Text>
              </View>
            )}
          </View>
        )}

        <View
          style={[
            styles.messageContainer,
            isMyMessage ? styles.myMessage : styles.otherMessage,
            params.chatType === "group" && !isMyMessage ? styles.groupOtherMessage : {},
          ]}
        >
          {params.chatType === "group" && !isMyMessage && (
            <Text style={[styles.senderName, { color: getUserColor(message.from._id) }]}>{message.from.name}</Text>
          )}

          {/* Attachments */}
          {Array.isArray((message as any).attachments) && (message as any).attachments.length > 0 && (
            <View style={{ gap: 8 }}>
              {(message as any).attachments.map((att: any, idx: number) => (
                <View key={String(idx)}>
                  {att.type === 'image' ? (
                    <TouchableOpacity onPress={() => setMediaViewer({ visible: true, url: att.url, type: 'image' })}>
                      <Image source={{ uri: att.url }} style={{ width: 220, height: 220, borderRadius: 10, backgroundColor: '#eee' }} />
                    </TouchableOpacity>
                  ) : att.type === 'video' ? (
                    <TouchableOpacity onPress={() => setMediaViewer({ visible: true, url: att.url, type: 'video' })}>
                      <ExpoVideo source={{ uri: att.url }} style={{ width: 220, height: 220, borderRadius: 10, backgroundColor: '#000' }} useNativeControls resizeMode={'cover' as any} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => setMediaViewer({ visible: true, url: att.url, type: 'file' })}>
                      <Text style={{ color: '#fff', textDecorationLine: 'underline' }}>{att.name || 'file'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          )}

          {"replyTo" in (message as any) && (message as any).replyTo && (
            <View style={styles.replyBubble}>
              <View style={[styles.replyBar, { backgroundColor: isMyMessage ? "#9bd7a1" : "#bbb" }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.replyName}>
                  {((message as any).replyTo.from?.name) || "Replied"}
                </Text>
                <Text style={styles.replyText} numberOfLines={2}>
                  {(message as any).replyTo.text}
                </Text>
              </View>
            </View>
          )}

          <Text style={[styles.messageText, isMyMessage ? styles.myMessageText : styles.otherMessageText]}>
            {message.text}
          </Text>

          {/* Simple link preview */}
          {(() => {
            try {
              const match = String(message.text || '').match(/https?:\/\/[^\s]+/i)
              if (!match) return null
              const url = match[0]
              return (
                <TouchableOpacity onPress={() => { try { (require('expo-web-browser') as any).openBrowserAsync(url) } catch {} }} style={{ marginTop: 8 }}>
                  <View style={{ backgroundColor: isMyMessage ? '#e6f2ff' : '#f5f5f5', borderRadius: 10, padding: 10, maxWidth: 260 }}>
                    <Text numberOfLines={2} style={{ color: '#1a0dab', textDecorationLine: 'underline' }}>{url}</Text>
                    <Text style={{ color: '#555', marginTop: 4 }} numberOfLines={2}>Open link</Text>
                  </View>
                </TouchableOpacity>
              )
            } catch { return null }
          })()}

          {/* Reactions bar */}
          {Array.isArray((message as any).reactions) && (message as any).reactions.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {Array.from(Object.entries(((message as any).reactions as any[]).reduce((acc: any, r: any) => { acc[r.type] = (acc[r.type]||0)+1; return acc }, {}))).map(([emoji, count]: any) => (
                <View key={emoji} style={{ backgroundColor: isMyMessage ? '#e6f2ff' : '#f2f2f2', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: '#333' }}>{emoji} {count > 1 ? count : ''}</Text>
                </View>
              ))}
            </View>
          )}

          {messageTime && (
            <Text style={[styles.timeText, isMyMessage ? styles.myTimeText : styles.otherTimeText]}>{messageTime}</Text>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  const TypingIndicator = () => {
    if (typingUsers.length === 0) return null

    console.log(typingUsers, "======================")

    const validTypingUsers = typingUsers.filter((user) => user && user._id && user.name)

    if (validTypingUsers.length === 0) return null

    const typingText =
      validTypingUsers.length === 1
        ? `${validTypingUsers[0].name || "Someone"} is typing...`
        : validTypingUsers.length === 2
          ? `${validTypingUsers[0].name || "Someone"} and ${validTypingUsers[1].name || "someone else"} are typing...`
          : `${validTypingUsers[0].name || "Someone"} and ${validTypingUsers.length - 1} others are typing...`

    return (
      <View style={styles.typingContainer}>
        <Avatar.Image
          size={30}
          source={{ uri: params.chatType === "direct" ? otherUser?.profilePic : group?.groupPic }}
        />
        <View style={styles.typingBubble}>
          <Text style={styles.typingText}>{typingText}</Text>
          <View style={styles.typingDots}>
            <Animated.View style={[styles.typingDot, { opacity: dot1Opacity }]} />
            <Animated.View style={[styles.typingDot, { opacity: dot2Opacity }]} />
            <Animated.View style={[styles.typingDot, { opacity: dot3Opacity }]} />
          </View>
        </View>
      </View>
    )
  }

  const GroupInfoModal = () => (
    <Modal visible={showGroupInfo} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Group Info</Text>
          <TouchableOpacity onPress={() => setShowGroupInfo(false)}>
            <Icon name="close" size={24} color="#000" />
          </TouchableOpacity>
        </View>

        {group && (
          <ScrollView style={styles.modalContent}>
            <View style={styles.groupInfoHeader}>
              <Avatar.Image size={80} source={{ uri: group.groupPic }} />
              <Text style={styles.groupName}>{group.name}</Text>
              <Text style={styles.memberCount}>{group.members.length} members</Text>
            </View>

            <View style={styles.membersSection}>
              <Text style={styles.sectionTitle}>Members</Text>
              {group.members.map((member) => (
                <View key={member._id} style={styles.memberItem}>
                  <Avatar.Image size={40} source={{ uri: member.profilePic }} />
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.memberStatus}>
                      {onlineUsers.has(member._id) ? "Online" : "Offline"}
                      {group.admins.includes(member._id) && " • Admin"}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  )

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <Text>Loading chat...</Text>
      </View>
    )
  }

  if (!currentUser) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <Text>Error: Please login again</Text>
      </View>
    )
  }

  const getHeaderInfo = () => {
    if (params.chatType === "direct") {
      return {
        name: otherUser?.name || "Unknown User",
        avatar: otherUser?.profilePic || "https://i.pravatar.cc/150?img=1",
        status: onlineUsers.has(params.chatId) ? "Online" : "Offline",
      }
    } else {
      const onlineCount = group?.members?.reduce((acc, m) => acc + (onlineUsers.has(m._id) ? 1 : 0), 0) || 0
      return {
        name: group?.name || "Group Chat",
        avatar: group?.groupPic || "https://i.pravatar.cc/150?img=1",
        status: `${onlineCount} online · ${group?.members.length || 0} members`,
      }
    }
  }

  const headerInfo = getHeaderInfo()

  return (
  
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <TouchableOpacity
          style={styles.topBar}
          onPress={() => {
            if (params.chatType === "group") {
              router.push({ pathname: `/groups/${params.chatId}` })
            }
          }}
          disabled={params.chatType === "direct"}
        >
          <Avatar.Image size={40} source={{ uri: headerInfo.avatar }} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.nameText}>{headerInfo.name}</Text>
            <Text style={styles.statusText}>{headerInfo.status}</Text>
          </View>
          {params.chatType === "group" && <Icon name="chevron-right" size={24} color="#666" />}
          <View style={[styles.connectionStatus, { backgroundColor: isConnected ? "#4CAF50" : "#F44336" }]} />
        </TouchableOpacity>

        <FlatList
          ref={flatListRef}
          data={chatItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 10 }}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          ListFooterComponent={() =>
            typingUsers.length > 0 ? (
              <View style={styles.typingIndicatorInList}>
                <TypingIndicator />
              </View>
            ) : null
          }
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
            autoscrollToTopThreshold: 10,
          }}
        />

        {showScrollToBottom && (
          <TouchableOpacity style={styles.scrollToBottomButton} onPress={() => {
            flatListRef.current?.scrollToEnd({ animated: true })
            setShowScrollToBottom(false)
            setNewMessagesCount(0)
            setIsUserAtBottom(true)
            isUserAtBottomRef.current = true
          }}>
            <Icon name="arrow-downward" size={20} color="#fff" />
            {newMessagesCount > 0 && <Text style={styles.scrollToBottomText}>{newMessagesCount}</Text>}
          </TouchableOpacity>
        )}

        <View style={styles.inputContainer}>
          {replyingTo && (
            <View style={styles.replyPreview}>
              <View style={[styles.replyBar, { backgroundColor: "#0095f6" }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.replyName}>{replyingTo.from.name}</Text>
                <Text style={styles.replyText} numberOfLines={1}>{replyingTo.text}</Text>
              </View>
              <TouchableOpacity onPress={() => setReplyingTo(null)}>
                <Icon name="close" size={18} color="#666" />
              </TouchableOpacity>
            </View>
          )}
          <TextInput
            style={styles.input}
            placeholder="Message..."
            placeholderTextColor="#999"
            value={inputText}
            onChangeText={handleTextChange}
            multiline
            maxLength={500}
          />
          <TouchableOpacity onPress={onAttachPress} style={[styles.attachButton]}>
            <Icon name="attach-file" size={22} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity onPress={recordAndSendVoiceNote} style={[styles.attachButton]}>
            <Icon name="mic" size={22} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={sendMessage}
            style={[
              styles.sendButton,
              { opacity: inputText.trim() ? 1 : 0.5 },
            ]}
            disabled={!inputText.trim()}
          >
            <Icon name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        {params.chatType === "group" && <GroupInfoModal />}
        {mediaViewer.visible && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setMediaViewer({ visible: false, url: '', type: 'image' })}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }}>
              <TouchableOpacity onPress={() => setMediaViewer({ visible: false, url: '', type: 'image' })} style={{ position: 'absolute', top: 40, right: 20 }}>
                <Icon name="close" size={28} color="#fff" />
              </TouchableOpacity>
              {mediaViewer.type === 'image' ? (
                <Image source={{ uri: mediaViewer.url }} style={{ width: '92%', height: '70%', resizeMode: 'contain' as any }} />
              ) : mediaViewer.type === 'video' ? (
                <ExpoVideo source={{ uri: mediaViewer.url }} style={{ width: '92%', height: '70%' }} useNativeControls resizeMode={'contain' as any} shouldPlay={false} isLooping={false} />
              ) : (
                <TouchableOpacity onPress={() => { try { (require('expo-web-browser') as any).openBrowserAsync(mediaViewer.url) } catch {} }}>
                  <Text style={{ color: '#fff', textDecorationLine: 'underline' }}>Open file</Text>
                </TouchableOpacity>
              )}
            </View>
          </Modal>
        )}
      </KeyboardAvoidingView>
    
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  nameText: {
    fontSize: 18,
    fontWeight: "bold",
  },
  statusText: {
    fontSize: 14,
    color: "#666",
  },
  connectionStatus: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: 10,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginVertical: 5,
  },
  myMessageRow: {
    justifyContent: "flex-end",
  },
  otherMessageRow: {
    justifyContent: "flex-start",
  },
  avatarContainer: {
    marginRight: 10,
  },
  initialsAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  initialsText: {
    color: "#fff",
    fontSize: 14,
  },
  messageContainer: {
    maxWidth: "80%",
    padding: 10,
    borderRadius: 15,
  },
  myMessage: {
    backgroundColor: "#DCF8C6",
  },
  otherMessage: {
    backgroundColor: "#ECECEC",
  },
  groupOtherMessage: {
    backgroundColor: "#ECECEC",
  },
  senderName: {
    fontSize: 14,
    marginBottom: 2,
  },
  messageText: {
    fontSize: 16,
  },
  myMessageText: {
    color: "#000",
  },
  otherMessageText: {
    color: "#000",
  },
  timeText: {
    fontSize: 12,
    marginTop: 2,
  },
  myTimeText: {
    color: "#666",
  },
  otherTimeText: {
    color: "#666",
  },
  typingContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
  },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECECEC",
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 10,
  },
  typingText: {
    fontSize: 14,
    marginRight: 5,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#000",
    marginRight: 5,
  },
  typingDots: {
    flexDirection: "row",
    alignItems: "center",
  },
  typingIndicatorInList: {
    padding: 10,
  },
  scrollToBottomButton: {
    position: "absolute",
    right: 16,
    bottom: 70,
    backgroundColor: "#0095f6",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  scrollToBottomText: {
    color: "#fff",
    marginLeft: 6,
    fontWeight: "bold",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  modalContent: {
    flex: 1,
    padding: 10,
  },
  groupInfoHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  groupName: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 10,
  },
  memberCount: {
    fontSize: 14,
    color: "#666",
  },
  membersSection: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  memberInfo: {
    marginLeft: 10,
  },
  memberName: {
    fontSize: 14,
    fontWeight: "bold",
  },
  memberStatus: {
    fontSize: 12,
    color: "#666",
  },
  dateHeader: {
    alignItems: "center",
    marginVertical: 10,
  },
  dateHeaderText: {
    fontSize: 14,
    color: "#666",
  },
  systemChipContainer: {
    alignItems: "center",
    marginVertical: 8,
    paddingHorizontal: 10,
  },
  systemChip: {
    backgroundColor: "#f0f6ff",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#cfe2ff",
  },
  systemChipText: {
    color: "#0b5ed7",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#ddd",
    backgroundColor: "#fff",
  },
  replyPreview: {
    position: "absolute",
    left: 16,
    right: 66,
    bottom: 56,
    backgroundColor: "#f2f2f2",
    borderRadius: 12,
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  replyBubble: {
    borderLeftWidth: 0,
    backgroundColor: "#e8e8e8",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  replyBar: {
    width: 4,
    height: "100%",
    borderRadius: 2,
    marginRight: 6,
  },
  replyName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  replyText: {
    fontSize: 12,
    color: "#555",
  },
  input: {
    flex: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 20,
    marginRight: 10,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: "#fff",
  },
  attachButton: {
    width: 38,
    height: 38,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f2f2',
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
})