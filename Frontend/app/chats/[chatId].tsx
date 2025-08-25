"use client"

import { apiService } from "@/services/api.service"
import { socketService } from "@/services/socket.service"
import type { ChatParams, Group, TypingUser, User } from "@/types/chat.types"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useRef, useState, useCallback } from "react"
import { useFocusEffect } from "@react-navigation/native"
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
  status?: 'sending' | 'sent' | 'failed'
  uploadProgress?: number
  linkPreview?: { url: string; title?: string; description?: string; image?: string; siteName?: string } | null
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
  const [isRecording, setIsRecording] = useState(false)
  const recordingRef = useRef<Audio.Recording | null>(null)
  const [recordingMs, setRecordingMs] = useState(0)
  const recordingTimerRef = useRef<any>(null)

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
  const [reactingTo, setReactingTo] = useState<ChatMessage | null>(null)

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

  // Kick off loading on mount
  useEffect(() => {
    ;(async () => { try { await loadUserAndInitialize() } catch {} })()
  }, [])

  // Attach/Recording handlers (lightweight stubs to avoid runtime errors)
  const onAttachPress = async () => {
    try {
      // Placeholder for attachment picker; no-op for now
    } catch {}
  }
  const startHoldRecording = async () => {
    try {
      setIsRecording(true)
      setRecordingMs(0)
      try { if (recordingTimerRef.current) clearInterval(recordingTimerRef.current) } catch {}
      recordingTimerRef.current = setInterval(() => {
        setRecordingMs((ms) => ms + 250)
      }, 250)
    } catch {}
  }
  const stopHoldRecording = async (send: boolean) => {
    try {
      setIsRecording(false)
      try { if (recordingTimerRef.current) clearInterval(recordingTimerRef.current) } catch {}
      setRecordingMs(0)
      // TODO: implement audio upload if needed
    } catch {}
  }

  const initializeSocket = async (user: User) => {
    try {
      // await socketService.connect()
      setIsConnected(true)

      console.log("[v0] Socket initialized for user:", user._id)

      socketService.registerUser(user._id)

      // Seed presence map once at connect
      try {
        const res: any = await apiService.getOnlineUsers()
        if (res?.success && Array.isArray(res.userIds)) setOnlineUsers(new Set(res.userIds.map(String)))
      } catch {}

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
            linkPreview: msg.linkPreview || null,
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

            // Decide autoscroll: if user is near bottom or message is from me, autoscroll to end
            const shouldAuto = isUserAtBottomRef.current || newMessage.sender === 'me'
            if (!shouldAuto && newMessage.sender !== "me") {
              setNewMessagesCount((c) => c + 1)
              setShowScrollToBottom(true)
            } else {
              setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50)
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
        setMessages((prev) => prev.map((m) => {
          if (params.chatType === 'direct' && payload?.chatType === 'direct') {
            // any message from me to peer is now read by peer
            if (m.sender === 'me') {
              const rb = Array.isArray((m as any).readBy) ? new Set((m as any).readBy.map(String)) : new Set<string>()
              if (payload?.peerId) rb.add(String(payload.peerId))
              if (currentUser?._id) rb.add(String(currentUser._id))
              return { ...(m as any), readBy: Array.from(rb) } as any
            }
          } else if (params.chatType === 'group' && payload?.chatType === 'group' && String(payload?.groupId) === String(params.chatId)) {
            const rb = Array.isArray((m as any).readBy) ? new Set((m as any).readBy.map(String)) : new Set<string>()
            if (payload?.readerId) rb.add(String(payload.readerId))
            return { ...(m as any), readBy: Array.from(rb) } as any
          }
          return m
        }))
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
                    name: data.name || "Someone",
                  },
                ]
              }
              return prev
            })
          }
        }
        socketService.onGroupTyping(onGroupTypingCb)
        typingListenerRef.current = onGroupTypingCb
      }
    } catch (error) {
      console.error("[v0] Socket initialization error:", error)
      setIsConnected(false)
    }
  }

  async function loadChatData(user: User) {
    try {
      setIsLoading(true)
      if (params.chatType === "direct") {
        const res = await apiService.getDirectMessages(params.chatId)
        const messages = (res as any)?.messages || []
        const formattedMessages: ChatMessage[] = messages.map((msg: any) => ({
          id: msg._id,
          text: msg.text,
          sender: msg.from === user._id ? "me" : "other",
          from: resolveFromUser(msg.from),
          to: resolveFromUser(msg.to),
          messageType: "direct",
          createdAt: msg.createdAt,
          attachments: msg.attachments,
          linkPreview: msg.linkPreview || null,
        }))
        console.log("[v0] Loaded direct messages:", formattedMessages.length)
        setMessages(formattedMessages)
      } else {
        const res = await apiService.getGroupMessages(params.chatId)
        const messages = (res as any)?.messages || []
        const formattedMessages: ChatMessage[] = messages.map((msg: any) => ({
          id: msg._id,
          text: msg.text,
          sender: msg.from === user._id ? "me" : "other",
          from: resolveFromUser(msg.from),
          group: params.chatId,
          messageType: "group",
          createdAt: msg.createdAt,
          system: /\badded\b/i.test(String(msg.text || "")),
          attachments: msg.attachments,
          linkPreview: msg.linkPreview || null,
        }))
        console.log("[v0] Loaded group messages:", formattedMessages.length)
        setMessages(formattedMessages)
      }
    } catch (error) {
      console.error("[v0] Error fetching messages:", error)
      Alert.alert("Error", "Failed to load messages")
    } finally {
      setIsLoading(false)
    }
  }

  const startTypingAnimation = () => {
    const animateDot = (dot: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true, delay }),
          Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ]),
      ).start()
    }
    animateDot(dot1Opacity, 0)
    animateDot(dot2Opacity, 150)
    animateDot(dot3Opacity, 300)
  }

  const stopTypingAnimation = () => {
    dot1Opacity.stopAnimation()
    dot2Opacity.stopAnimation()
    dot3Opacity.stopAnimation()
    dot1Opacity.setValue(0.3)
    dot2Opacity.setValue(0.3)
    dot3Opacity.setValue(0.3)
  }

  function processMessagesWithDates(items: ChatMessage[]): Array<ChatItem> {
    const out: Array<ChatItem> = []
    let lastKey = ""
    for (const m of (items || [])) {
      const d = new Date(m.createdAt || new Date().toISOString())
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      if (key !== lastKey) {
        lastKey = key
        const display = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        out.push({ id: `date-${key}`, type: 'date', date: key, displayText: display })
      }
      out.push(m)
    }
    return out
  }

  useEffect(() => {
    // Interleave date headers and transform system messages into centered chips
    const withDates = processMessagesWithDates(messages)
    const processedItems: ChatItem[] = withDates.map((item) => {
      if ("type" in item && item.type === "system") return item
      const m = item as ChatMessage
      return m
    })
    setChatItems(processedItems)
  }, [messages])

  const renderItem = ({ item }: { item: ChatItem }) => {
    if ("type" in item && item.type === "date") {
      return (
        <View style={styles.dateHeader}>
          <Text style={styles.dateHeaderText}>{(item as DateHeader).displayText}</Text>
        </View>
      )
    }

    if ("type" in item && item.type === "system") {
      const sys = item as SystemChipItem
      return (
        <View style={[styles.systemChip, { alignSelf: "center" }]}> 
          <Text style={styles.systemChipText}>{sys.text}</Text>
        </View>
      )
    }

    const message = item as ChatMessage
    const isMyMessage = message.sender === "me"

    return (
      <View style={[styles.messageContainer, isMyMessage ? styles.myMessage : styles.otherMessage]} onStartShouldSetResponder={() => true} onResponderGrant={(e) => { /* noop */ }}>
        <TouchableOpacity activeOpacity={0.9} onLongPress={() => setReactingTo(message)} delayLongPress={200}>
        {/* Message bubble */}
        <View style={[styles.messageBubble, isMyMessage ? styles.myBubble : styles.otherBubble]}>
          {/* Text content */}
          {message.text && (
            <Text style={[styles.messageText, isMyMessage ? styles.myMessageText : styles.otherMessageText]}>
              {message.text}
            </Text>
          )}

          {/* Attachments */}
          {Array.isArray((message as any).attachments) && (message as any).attachments.length > 0 && (
            <View style={{ gap: 8 }}>
              {(message as any).attachments.map((att: any, idx: number) => (
                <View key={String(idx)}>
                  {att.type === 'image' ? (
                    <Image source={{ uri: att.url }} style={{ width: 220, height: 220, borderRadius: 10, backgroundColor: '#ddd' }} resizeMode="cover" />
                  ) : att.type === 'video' ? (
                    <ExpoVideo source={{ uri: att.url }} style={{ width: 220, height: 220, borderRadius: 10, backgroundColor: '#000' }} useNativeControls resizeMode="cover" />
                  ) : (
                    <View style={{ padding: 12, backgroundColor: '#f0f0f0', borderRadius: 8 }}><Text style={{ color: '#333' }}>{att.name || 'File'}</Text></View>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Link Preview */}
          {message.linkPreview && message.linkPreview.url ? (
            <View style={styles.linkCard}>
              {message.linkPreview.image ? (
                <Image source={{ uri: message.linkPreview.image }} style={styles.linkImage} resizeMode="cover" />
              ) : null}
              <View style={styles.linkContent}>
                {message.linkPreview.siteName ? <Text numberOfLines={1} style={styles.linkSite}>{message.linkPreview.siteName}</Text> : null}
                {message.linkPreview.title ? <Text numberOfLines={2} style={styles.linkTitle}>{message.linkPreview.title}</Text> : null}
                {message.linkPreview.description ? <Text numberOfLines={3} style={styles.linkDesc}>{message.linkPreview.description}</Text> : null}
                <Text numberOfLines={1} style={styles.linkUrl}>{message.linkPreview.url}</Text>
              </View>
            </View>
          ) : null}

          {"replyTo" in (message as any) && (message as any).replyTo && (
            <View style={styles.replyBubble}>
              <View style={[styles.replyBar, { backgroundColor: isMyMessage ? "#9bd7a1" : "#bbb" }]} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#555", fontSize: 12 }} numberOfLines={1}>
                  Replying to {(message as any).replyTo?.from?.name || ""}
                </Text>
                <Text style={{ color: "#333" }} numberOfLines={1}>
                  {(message as any).replyTo?.text || ""}
                </Text>
              </View>
            </View>
          )}
        </View>
        </TouchableOpacity>

        {/* Reactions row */}
        {Array.isArray((message as any).reactions) && (message as any).reactions.length > 0 && (
          <View style={styles.reactionsRow}>
            {Array.from(new Map(((message as any).reactions || []).map((r: any) => [r.type, 0])).keys()).map((t: string) => (
              <View key={t} style={styles.reactionChip}><Text style={styles.reactionText}>{t}</Text></View>
            ))}
          </View>
        )}

        {/* Metadata row (time, read receipts) */}
        <View style={styles.metaRow}>
          <Text style={styles.timeText}>{new Date(message.createdAt || "").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
        </View>
      </View>
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
          <View>
            <Avatar.Image size={40} source={{ uri: headerInfo.avatar }} />
            {params.chatType === 'direct' && onlineUsers.has(params.chatId) && (
              <View style={{ position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: '#4CAF50', borderWidth: 2, borderColor: '#fff', shadowColor: '#4CAF50', shadowOpacity: 0.9, shadowRadius: 6 }} />
            )}
          </View>
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.nameText}>{headerInfo.name}</Text>
            <Text style={[styles.statusText, params.chatType === 'direct' ? (onlineUsers.has(params.chatId) ? { color: '#4CAF50', fontWeight: '700' } : { color: '#999' }) : null]}>{headerInfo.status}</Text>
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
          {isRecording ? (
            <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff0f0', borderColor: '#f5a3a3' } as any]}>
              <Icon name="fiber-manual-record" size={16} color="#e53935" />
              <Text style={{ marginLeft: 8, color: '#e53935', fontWeight: '700' }}>{formatDuration(recordingMs)}</Text>
              <Text style={{ marginLeft: 8, color: '#666' }}>Release to send</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => stopHoldRecording(false)}>
                <Icon name="delete" size={20} color="#666" />
              </TouchableOpacity>
            </View>
          ) : (
            <TextInput
              style={styles.input}
              placeholder="Message..."
              placeholderTextColor="#999"
              value={inputText}
              onChangeText={handleTextChange}
              multiline
              maxLength={500}
            />
          )}
          <TouchableOpacity onPress={onAttachPress} style={[styles.attachButton]}>
            <Icon name="attach-file" size={22} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity onPressIn={startHoldRecording} onPressOut={() => stopHoldRecording(true)} style={[styles.attachButton]}>
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
        {/* Quick Reactions Modal */}
        <Modal visible={!!reactingTo} transparent animationType="fade" onRequestClose={() => setReactingTo(null)}>
          <View style={styles.reactOverlay}>
            <View style={styles.reactBar}>
              {['❤️','👍','😂','😮','😢','🔥'].map((emoji) => (
                <TouchableOpacity key={emoji} style={styles.reactBtn} onPress={async () => {
                  const msgId = (reactingTo as any)?.id
                  try { await apiService.request(`/messages/${msgId}/react`, { method: 'POST', body: JSON.stringify({ type: emoji }) }) } catch {}
                  setReactingTo(null)
                }}>
                  <Text style={{ fontSize: 20 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[styles.reactBtn, { marginLeft: 6 }]} onPress={async () => {
                const msgId = (reactingTo as any)?.id
                try { await apiService.request(`/messages/${msgId}/react`, { method: 'POST', body: JSON.stringify({ type: null }) }) } catch {}
                setReactingTo(null)
              }}>
                <Text style={{ fontSize: 14, color: '#e53935', fontWeight: '700' }}>Remove</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.reactBackdrop} onPress={() => setReactingTo(null)} />
          </View>
        </Modal>
      </KeyboardAvoidingView>
    
  )
}

function AudioPlayer({ sourceUrl }: { sourceUrl: string }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(1)
  const [rate, setRate] = useState(1.0)

  useEffect(() => {
    let mounted = true
    const setup = async () => {
      try {
        const { sound: s } = await Audio.Sound.createAsync({ uri: sourceUrl }, { shouldPlay: false, rate, shouldCorrectPitch: true }, (st) => {
          if (!mounted) return
          if (st?.isLoaded) {
            setPosition(st.positionMillis || 0)
            setDuration(st.durationMillis || Math.max(1, duration))
            setIsPlaying(Boolean(st.isPlaying))
          }
        })
        setSound(s)
      } catch {}
    }
    setup()
    return () => {
      mounted = false
      try { sound?.unloadAsync() } catch {}
    }
  }, [sourceUrl])

  const togglePlay = async () => {
    try {
      if (!sound) return
      const st: any = await sound.getStatusAsync()
      if (st?.isPlaying) { await sound.pauseAsync() } else { await sound.playAsync() }
    } catch {}
  }

  const cycleRate = async () => {
    try {
      if (!sound) return
      const options = [1.0, 1.5, 2.0, 0.5]
      const idx = options.indexOf(rate)
      const next = options[(idx + 1) % options.length]
      setRate(next)
      try { await sound.setRateAsync(next, true) } catch {}
    } catch {}
  }

  const onWaveformPress = async (evt: any) => {
    try {
      if (!sound) return
      const width = 160
      const x = evt?.nativeEvent?.locationX || 0
      const frac = Math.max(0, Math.min(1, x / width))
      const target = Math.floor(frac * duration)
      await sound.setPositionAsync(target)
    } catch {}
  }

  const bars = 40
  const progress = Math.max(0, Math.min(1, duration > 0 ? position / duration : 0))
  const activeBars = Math.round(progress * bars)

  return (
    <View style={{ width: 220, padding: 10, borderRadius: 10, backgroundColor: '#f7f7f7' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={togglePlay} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#0095f6', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
          <Icon name={isPlaying ? 'pause' : 'play-arrow'} size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={cycleRate} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#eaeaea', marginRight: 8 }}>
          <Text style={{ fontWeight: '700', color: '#333' }}>{rate.toFixed(1)}x</Text>
        </TouchableOpacity>
        <Text style={{ fontVariant: ['tabular-nums'] as any, color: '#333' }}>{formatTimeShort(position)} / {formatTimeShort(duration)}</Text>
      </View>
      <TouchableOpacity onPress={onWaveformPress} activeOpacity={0.9} style={{ marginTop: 8, height: 36, width: 200, flexDirection: 'row', alignItems: 'flex-end' }}>
        {Array.from({ length: bars }).map((_, i) => {
          const h = 8 + ((i % 6) * 4) // simple repeating bars; placeholder without server-side peaks
          const on = i < activeBars
          return <View key={i} style={{ width: 4, height: h, marginRight: 1.5, backgroundColor: on ? '#0095f6' : '#cfcfcf', borderRadius: 2 }} />
        })}
      </TouchableOpacity>
    </View>
  )
}

function formatTimeShort(ms: number) {
  const s = Math.floor((ms || 0) / 1000)
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function formatDuration(ms: number) {
  const total = Math.floor((ms || 0) / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

// List scroll handler
function handleScroll(e: any) {
  try {
    const { layoutMeasurement, contentSize, contentOffset } = e?.nativeEvent || {}
    if (!layoutMeasurement || !contentSize || !contentOffset) return
    const paddingToBottom = 60
    const atBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - paddingToBottom
    // Using global refs via closure: keep both state and ref in sync
    setIsUserAtBottom(atBottom)
    isUserAtBottomRef.current = atBottom
    if (atBottom) {
      setShowScrollToBottom(false)
      setNewMessagesCount(0)
    }
  } catch {}
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
  linkCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkImage: {
    width: 80,
    height: 80,
    borderRadius: 4,
    marginRight: 10,
  },
  linkContent: {
    flex: 1,
  },
  linkSite: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  linkTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  linkDesc: {
    fontSize: 12,
    color: '#555',
    marginBottom: 4,
  },
  linkUrl: {
    fontSize: 12,
    color: '#333',
    marginBottom: 2,
  },
  metaRow: { marginTop: 4, alignSelf: 'flex-end' },
  messageBubble: {},
  myBubble: {},
  otherBubble: {},
  reactionsRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  reactionChip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  reactionText: { fontSize: 12 },
  reactOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)' },
  reactBar: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 8, elevation: 2, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8 },
  reactBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  reactBackdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
})