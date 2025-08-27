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
import PresenceBadge from "@/components/PresenceBadge"
import ReactionsBar from "@/components/ReactionsBar"
import SwipeReply from "@/components/SwipeReply"
import { LinearGradient } from "expo-linear-gradient"

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
  poll?: { question: string; options: Array<{ id: string; text: string; votes: number }>; allowMultiple?: boolean; allowChange?: boolean; endsAt?: string|null }
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
  const [isScreenFocused, setIsScreenFocused] = useState(false)
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null)
  const [reactingTo, setReactingTo] = useState<ChatMessage | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const recordingRef = useRef<Audio.Recording | null>(null)
  const [recordingMs, setRecordingMs] = useState(0)
  const recordingTimerRef = useRef<any>(null)
  const [reactionAnchor, setReactionAnchor] = useState<{ x: number; y: number } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchMatches, setSearchMatches] = useState<number[]>([])
  const [searchIndex, setSearchIndex] = useState(0)
  const [ephemeralMode, setEphemeralMode] = useState(false)
  const [cancelHintVisible, setCancelHintVisible] = useState(false)
  const [holdDx, setHoldDx] = useState(0)
  const [lastReadAt, setLastReadAt] = useState<string | null>(null)

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
  const draftKey = `chat_draft_${params.chatType}_${params.chatId}`
  const ephemeralKey = `chat_ephemeral_${params.chatType}_${params.chatId}`

  const dot1Opacity = useRef(new Animated.Value(0.3)).current
  const dot2Opacity = useRef(new Animated.Value(0.3)).current
  const dot3Opacity = useRef(new Animated.Value(0.3)).current

  const [mediaViewer, setMediaViewer] = useState<{ visible: boolean; url: string; type: 'image' | 'video' | 'file' }>({ visible: false, url: '', type: 'image' })
  const [showTtlPicker, setShowTtlPicker] = useState(false)
  const [pollComposerOpen, setPollComposerOpen] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState<string[]>(['', ''])
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false)
  const [pollAllowChange, setPollAllowChange] = useState(true)
  const [pollEndsAt, setPollEndsAt] = useState<string | null>(null)

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

        // Restore per-chat ephemeral preference
        try { const rawEphemeral = await AsyncStorage.getItem(ephemeralKey); if (rawEphemeral) setEphemeralMode(rawEphemeral === '1') } catch {}
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

  // Load draft on mount
  useEffect(() => {
    (async () => {
      try {
        const d = await AsyncStorage.getItem(draftKey)
        if (d != null) setInputText(d)
      } catch {}
    })()
    return () => {}
  }, [])

  // Persist draft on input change (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      AsyncStorage.setItem(draftKey, inputText).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [inputText])

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
            sender: String(fromUserId) === String(user._id) ? "me" : "other",
            from: resolveFromUser(msg.from),
            to: msg.to,
            group: msg.group,
            messageType: params.chatType,
            createdAt: msg.createdAt || new Date().toISOString(),
            system: /\badded\b/i.test(String(msg.text || "")),
            attachments: msg.attachments,
            poll: msg.poll,
          }

          // Mark as read only when actively viewing (focused and at bottom)
          if (fromUserId !== user._id && isScreenFocused && isUserAtBottomRef.current) {
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
                  (newGroupId ? String(mGroupId) === String(newGroupId) : true) &&
                  (newToId ? String(mToId) === String(newToId) : true) &&
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

            // Schedule removal for ephemeral
            if ((msg as any)?.expiresAt) {
              const ms = new Date((msg as any).expiresAt).getTime() - Date.now()
              if (ms > 0 && ms < 7*24*3600*1000) {
                setTimeout(() => {
                  setMessages((cur) => cur.filter((m) => m.id !== (newMessage as any).id))
                }, ms)
              }
            }

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
        setMessages((prev) => prev.map((m) => {
          if (m.id !== String(payload?._id)) return m
          const next: any = { ...(m as any), edited: true }
          if (typeof payload?.text === 'string') next.text = payload.text
          if (payload?.poll) next.poll = payload.poll
          return next
        }))
      }
      socketService.onMessageEdited(onEdited)
      editListenerRef.current = onEdited

      const onPoll = (payload: any) => {
        setMessages((prev) => prev.map((m) => (m.id === String(payload?._id) ? ({ ...(m as any), poll: payload.poll } as any) : m)))
      }
      try { socketService.onPollUpdated(onPoll) } catch {}

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

      const onUserStatusChangeCb = (data: { userId: string; status: "online" | "offline"; customStatus?: { text?: string; emoji?: string } }) => {
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
        if (params.chatType === 'direct' && String(params.chatId) === String(data.userId)) {
          // Force rerender of header where PresenceBadge is used
          setTypingUsers((prev) => [...prev])
        }
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
        const res = await apiService.getDirectMessages(params.chatId)
        const messages = (res as any)?.messages || []
        const formattedMessages: ChatMessage[] = messages.map((msg: any) => ({
          id: msg._id,
          text: msg.text,
          sender: ((typeof msg.from === 'object' ? msg.from?._id : msg.from) === user._id) ? "me" : "other",
          from: resolveFromUser(msg.from),
          to: resolveFromUser(msg.to),
          messageType: "direct",
          createdAt: msg.createdAt,
          attachments: msg.attachments,
          poll: msg.poll,
        }))
        console.log("[v0] Loaded direct messages:", formattedMessages.length)
        setMessages(formattedMessages)
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
            poll: msg.poll,
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

  // Throttle typing emits to at most once per 300ms
  const lastTypingSentRef = useRef<number>(0)
  const handleTextChange = (text: string) => {
    setInputText(text)

    if (currentUser) {
      const now = Date.now()
      if (now - (lastTypingSentRef.current || 0) >= 300) {
        lastTypingSentRef.current = now
        if (params.chatType === "direct") {
          socketService.sendTyping(params.chatId, currentUser._id, currentUser.name)
        } else {
          socketService.sendGroupTyping(params.chatId, currentUser._id, currentUser.name)
        }
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
    if (!currentUser) return
    if (pollComposerOpen) {
      const q = pollQuestion.trim()
      const opts = (pollOptions || []).map((o) => String(o || '').trim()).filter(Boolean)
      if (!q || opts.length < 2) { Alert.alert('Poll', 'Enter a question and at least two options'); return }
      const payload: any = { question: q, options: opts.map((t) => ({ text: t })), allowMultiple: pollAllowMultiple, allowChange: pollAllowChange }
      if (pollEndsAt) payload.endsAt = pollEndsAt
      try {
        const res: any = params.chatType === 'direct'
          ? await apiService.sendDirectPoll(params.chatId, payload, inputText.trim())
          : await apiService.sendGroupPoll(params.chatId, payload, inputText.trim())
        if (!(res as any)?.success) throw new Error((res as any)?.message || 'Failed to send poll')
        setPollComposerOpen(false)
        setPollQuestion('')
        setPollOptions(['', ''])
        setPollAllowMultiple(false)
        setPollAllowChange(true)
        setPollEndsAt(null)
        setInputText('')
      } catch (e) { Alert.alert('Poll', (e as Error).message) }
      return
    }
    if (!inputText.trim()) return

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
    try { await AsyncStorage.setItem(draftKey, "") } catch {}
    const tempId = `temp-${Date.now()}`
    const tempMessage: ChatMessage = {
      id: tempId,
      text: messageText,
      sender: "me",
      from: currentUser,
      to: params.chatType === "direct" ? ({ _id: params.chatId } as User) : undefined,
      group: params.chatType === "group" ? params.chatId : undefined,
      messageType: params.chatType,
      createdAt: new Date().toISOString(),
      replyTo: replyingTo || undefined,
      status: 'sending',
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
        if (ephemeralMode) {
          let ttl = 60
          try { const raw = await AsyncStorage.getItem(`${ephemeralKey}_ttl`); if (raw) ttl = Math.max(10, Math.min(7*24*3600, Number(raw))) } catch {}
          response = await apiService.sendDirectEphemeral(params.chatId, messageText, ttl, replyingTo?.id)
        }
        else response = await apiService.sendDirectMessage(params.chatId, messageText, replyingTo?.id)
      } else {
        if (ephemeralMode) {
          let ttl = 60
          try { const raw = await AsyncStorage.getItem(`${ephemeralKey}_ttl`); if (raw) ttl = Math.max(10, Math.min(7*24*3600, Number(raw))) } catch {}
          response = await apiService.sendGroupEphemeral(params.chatId, messageText, ttl, replyingTo?.id)
        }
        else response = await apiService.sendGroupMessage(params.chatId, messageText, replyingTo?.id)
      }

      if (!response.success) {
        console.error("[v0] API send message failed:", response)
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)))
      } else {
        console.log("[v0] Message sent successfully via API")
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'sent' } : m)))
      }
    } catch (error) {
      console.error("[v0] Error sending message via API:", error)
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)))
    }
    setReplyingTo(null)
  }

  const sendAttachment = async (assets: Array<{ uri: string; type?: string; name?: string }>) => {
    try {
      if (!currentUser || assets.length === 0) return
      // Create a temp uploading message with progress
      const tempId = `upload-${Date.now()}`
      const att = assets.slice(0,1)[0]
      const isVid0 = /\.(mp4|mov|m4v|webm)$/i.test(att.name || att.uri)
      const tempUploading: ChatMessage = {
        id: tempId,
        text: '',
        sender: 'me',
        from: currentUser,
        to: params.chatType === 'direct' ? ({ _id: params.chatId } as User) : undefined,
        group: params.chatType === 'group' ? params.chatId : undefined,
        messageType: params.chatType,
        createdAt: new Date().toISOString(),
        attachments: [{ url: att.uri, type: isVid0 ? 'video' : 'image', name: att.name || '' }],
        status: 'sending',
        uploadProgress: 0,
      }
      setMessages((prev) => [...prev, tempUploading])
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
              setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, uploadProgress: pct } : m)))
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
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'sent', uploadProgress: 100 } : m)))
      } catch (e) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)))
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
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, shouldDuckAndroid: true, playThroughEarpieceAndroid: false })
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

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000)
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(s % 60).padStart(2, '0')
    return `${mm}:${ss}`
  }

  const startHoldRecording = async () => {
    try {
      if (isRecording) return
      const perm = await Audio.requestPermissionsAsync()
      if (!perm.granted) return
      const rec = new Audio.Recording()
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
      await rec.startAsync()
      recordingRef.current = rec
      setRecordingMs(0)
      setIsRecording(true)
      if (recordingTimerRef.current) try { clearInterval(recordingTimerRef.current) } catch {}
      recordingTimerRef.current = setInterval(async () => {
        try {
          const st: any = await rec.getStatusAsync()
          if (st?.isRecording && typeof st?.durationMillis === 'number') setRecordingMs(st.durationMillis)
        } catch {}
      }, 200)
      setCancelHintVisible(true)
      setHoldDx(0)
    } catch {}
  }

  const stopHoldRecording = async (send: boolean) => {
    try {
      const rec = recordingRef.current
      if (!rec) { setIsRecording(false); return }
      await rec.stopAndUnloadAsync()
      if (recordingTimerRef.current) { try { clearInterval(recordingTimerRef.current) } catch {} ; recordingTimerRef.current = null }
      const uri = rec.getURI()
      const dur = recordingMs
      setIsRecording(false)
      recordingRef.current = null
      setRecordingMs(0)
      setCancelHintVisible(false)
      setHoldDx(0)
      if (send && uri && dur > 400) {
        const name = uri.split('/').pop() || 'voice-note.m4a'
        const type = name.endsWith('.3gp') ? 'audio/3gpp' : (name.endsWith('.m4a') ? 'audio/m4a' : 'audio/aac')
        await sendAttachment([{ uri, name, type }])
      }
    } catch {
      setIsRecording(false)
      recordingRef.current = null
      if (recordingTimerRef.current) { try { clearInterval(recordingTimerRef.current) } catch {} ; recordingTimerRef.current = null }
      setRecordingMs(0)
      setCancelHintVisible(false)
      setHoldDx(0)
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
    const processedItems: ChatItem[] = withDates.map((item, idx) => {
      if ((item as any)?.system) {
        return { ...(item as any), text: (item as any).text } as any
      }
      if (searchQuery && (item as any)?.text) {
        const hit = String((item as any).text || '').toLowerCase().includes(searchQuery.toLowerCase())
        if (hit) {
          // record index for navigation
          setSearchMatches((prev) => {
            const next = prev.slice()
            if (!next.includes(idx)) next.push(idx)
            return next
          })
        }
      }
      return item
    })
    setChatItems(processedItems)
  }, [messages])

  useEffect(() => {
    // recompute matches when query changes
    if (!searchQuery) { setSearchMatches([]); setSearchIndex(0); return }
    const hits: number[] = []
    chatItems.forEach((it: any, i: number) => {
      if (it?.type || !(it?.text)) return
      if (String(it.text).toLowerCase().includes(searchQuery.toLowerCase())) hits.push(i)
    })
    setSearchMatches(hits)
    setSearchIndex(0)
    if (hits.length > 0) setTimeout(() => { try { flatListRef.current?.scrollToIndex({ index: hits[0], animated: true }) } catch {} }, 50)
  }, [searchQuery])

  const jumpToMatch = (delta: number) => {
    if (searchMatches.length === 0) return
    const next = (searchIndex + delta + searchMatches.length) % searchMatches.length
    setSearchIndex(next)
    const idx = searchMatches[next]
    try { flatListRef.current?.scrollToIndex({ index: idx, animated: true }) } catch {}
  }

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
      try { if ((onPoll as any)) socketService.removePollUpdated(onPoll) } catch {}
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

  // Refresh presence on screen focus using a proper hook
  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true)
      let cancelled = false
      ;(async () => {
        try {
          const res: any = await apiService.getOnlineUsers()
          if (!cancelled && res?.success && Array.isArray(res.userIds)) {
            setOnlineUsers(new Set(res.userIds.map(String)))
          }
        } catch {}
      })()
      return () => { cancelled = true; setIsScreenFocused(false) }
    }, [])
  )

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
    // Grouping: detect if previous item is same sender within 5min
    let groupedWithPrev = false
    try {
      const idx = chatItems.findIndex((ci) => (ci as any)?.id === message.id)
      if (idx > 0) {
        const prev = chatItems[idx - 1] as any
        if (!prev?.type) {
          const prevMsg = prev as ChatMessage
          const sameSender = prevMsg.sender === message.sender
          const closeTime = Math.abs(new Date(prevMsg.createdAt || 0).getTime() - new Date(message.createdAt || 0).getTime()) < 5 * 60 * 1000
          groupedWithPrev = sameSender && closeTime
        }
      }
    } catch {}

    // Unread divider: show above the first unread incoming message when user is not at bottom
    const showUnreadDivider = !isMyMessage && !isUserAtBottom && newMessagesCount > 0 && (() => {
      try {
        if (!lastReadAt || !message.createdAt) return false
        return new Date(message.createdAt).getTime() > new Date(lastReadAt).getTime()
      } catch { return false }
    })()

    return (
      <SwipeReply onSwipeLeft={() => setReplyingTo(message)} onSwipeRight={() => setReplyingTo(message)}>
      {showUnreadDivider && (
        <View style={styles.unreadDividerContainer}>
          <View style={styles.unreadDividerLine} />
          <Text style={styles.unreadDividerText}>New messages</Text>
          <View style={styles.unreadDividerLine} />
        </View>
      )}
      <TouchableOpacity
        activeOpacity={0.7}
        style={[styles.messageRow, isMyMessage ? styles.myMessageRow : styles.otherMessageRow]}
      >
        {params.chatType === "group" && !isMyMessage && (
          <View style={styles.avatarContainer}>
            {message.from.profilePic ? (
              <Avatar.Image size={32} source={{ uri: message.from.profilePic }} />
            ) : (
              <View style={[styles.initialsAvatar, { backgroundColor: getUserColor(message.from._id) }]}> 
                <Text style={styles.initialsText}>{(message.from.name || 'U').slice(0,1).toUpperCase()}</Text>
              </View>
            )}
          </View>
        )}
        <LinearGradient
          colors={isMyMessage ? ['#DFF6FF', '#EAF4FF'] : ['#F7F8FA', '#EEF1F7']}
          start={[0, 0]}
          end={[1, 1]}
          style={[
            styles.messageContent,
            isMyMessage ? styles.myMessageGradient : styles.otherMessageGradient,
            groupedWithPrev && (isMyMessage ? { borderTopRightRadius: 14 } : { borderTopLeftRadius: 14 })
          ]}
        >
          {params.chatType === "group" && !isMyMessage && (
            <Text style={[styles.senderName, { color: getUserColor(message.from._id) }]}>{message.from.name}</Text>
          )}

          {/* Poll */}
          {message.poll && (
            <View style={{ gap: 10, marginTop: (message.text ? 8 : 0) }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#222' }}>{message.poll.question}</Text>
              {(message.poll.options || []).map((opt) => {
                const totalVotes = (message.poll?.options || []).reduce((s, o) => s + (o.votes || 0), 0)
                const pct = totalVotes > 0 ? Math.round(((opt.votes || 0) * 100) / totalVotes) : 0
                return (
                  <TouchableOpacity key={String(opt.id)} activeOpacity={0.7} onPress={async () => {
                    try {
                      const res: any = await apiService.votePoll(message.id, String(opt.id))
                      if (res?.success && res?.poll) {
                        setMessages((prev) => prev.map((m) => (m.id === message.id ? ({ ...(m as any), poll: res.poll } as any) : m)))
                      } else if (res?.message) { Alert.alert('Vote', res.message) }
                    } catch (e) { Alert.alert('Vote', 'Failed to vote') }
                  }}>
                    <View style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
                      <View style={{ position: 'relative', padding: 12 }}>
                        <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${pct}%`, backgroundColor: '#D6EAF8' }} />
                        <Text style={{ fontSize: 15, color: '#111' }}>{opt.text}</Text>
                        <Text style={{ position: 'absolute', right: 12, top: 12, fontSize: 12, color: '#333' }}>{pct}%</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )
              })}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: '#666', fontSize: 12 }}>
                  {(message.poll?.allowMultiple ? 'Multiple choice' : 'Single choice') + (message.poll?.allowChange === false ? ' • No change' : '')}
                </Text>
                <Text style={{ color: '#666', fontSize: 12 }}>
                  {(() => {
                    const total = (message.poll?.options || []).reduce((s, o) => s + (o.votes || 0), 0)
                    const end = message.poll?.endsAt ? ` • Ends ${new Date(String(message.poll.endsAt)).toLocaleString()}` : ''
                    return `${total} vote${total === 1 ? '' : 's'}${end}`
                  })()}
                </Text>
              </View>
            </View>
          )}

          {/* Attachments */}
          {Array.isArray((message as any).attachments) && (message as any).attachments.length > 0 && (
            <View style={{ gap: 8 }}>
              {(message as any).attachments.map((att: any, idx: number) => (
                <View key={String(idx)}>
                  {att.type === 'image' ? (
                    <TouchableOpacity onPress={() => setMediaViewer({ visible: true, url: att.url, type: 'image' })}>
                      <Image source={{ uri: att.url }} style={{ width: 220, height: 220, borderRadius: 10, backgroundColor: '#eaeaea' }} />
                    </TouchableOpacity>
                  ) : att.type === 'video' ? (
                    <TouchableOpacity onPress={() => setMediaViewer({ visible: true, url: att.url, type: 'video' })}>
                      <View style={{ width: 220, height: 220, borderRadius: 10, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
                        <ExpoVideo source={{ uri: att.url }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 10 }} useNativeControls resizeMode={'cover' as any} />
                        <Icon name="play-circle-filled" size={48} color="#fff" />
                      </View>
                    </TouchableOpacity>
                  ) : att.type === 'audio' ? (
                    <AudioPlayer sourceUrl={att.url} />
                  ) : (
                    <TouchableOpacity onPress={() => setMediaViewer({ visible: true, url: att.url, type: 'file' })}>
                      <Text style={{ color: '#333', textDecorationLine: 'underline' }}>{att.name || 'file'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          )}

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

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Text style={[styles.timeText, isMyMessage ? styles.myTimeText : styles.otherTimeText]}>
              {messageTime}
              {(() => {
                try {
                  const exp = (message as any).expiresAt || (message as any).expiresAt
                  if (!exp) return ''
                  const ms = new Date(exp).getTime() - Date.now()
                  if (ms <= 0) return ' · expired'
                  const s = Math.floor(ms/1000)
                  if (s < 60) return ` · ${s}s`
                  const m = Math.floor(s/60)
                  return ` · ${m}m`
                } catch { return '' }
              })()}
            </Text>
            {isMyMessage && (() => {
              // direct: double if peer id present in readBy; group: double if any member besides me present
              const rb = new Set<string>((Array.isArray((message as any).readBy) ? (message as any).readBy : []).map(String))
              if (params.chatType === 'direct') {
                const peerId = String(params.chatId)
                const seen = rb.has(peerId)
                return <Text style={{ fontSize: 12, color: seen ? '#4ea1ff' : '#888' }}>{seen ? '✓✓' : '✓'}</Text>
              } else {
                const me = String(currentUser?._id || '')
                rb.delete(me)
                const seen = rb.size > 0
                return <Text style={{ fontSize: 12, color: seen ? '#4ea1ff' : '#888' }}>{seen ? '✓✓' : '✓'}</Text>
              }
            })()}
            {isMyMessage && (message as any).status && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {(message as any).status === 'sending' && <Icon name="schedule" size={14} color="#888" />}
                {(message as any).status === 'failed' && <Icon name="error-outline" size={16} color="#e53935" />}
                {(message as any).status === 'failed' && (
                  <TouchableOpacity onPress={async () => {
                    try {
                      const body: any = { text: String((message as any).text || ''), messageType: params.chatType as any, replyTo: (message as any)?.replyTo?.id }
                      if (params.chatType === 'direct') Object.assign(body, { to: String(params.chatId) })
                      else Object.assign(body, { group: String(params.chatId) })
                      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...(m as any), status: 'sending' } : m)))
                      const res = await apiService.request('/messages', { method: 'POST', body: JSON.stringify(body) })
                      if (!(res as any)?.success) throw new Error((res as any)?.message || 'Retry failed')
                      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...(m as any), status: 'sent' } : m)))
                    } catch {
                      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...(m as any), status: 'failed' } : m)))
                    }
                  }}>
                    <Icon name="refresh" size={14} color="#e53935" />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
          {(isMyMessage && typeof (message as any).uploadProgress === 'number' && (message as any).uploadProgress >= 0 && (message as any).uploadProgress < 100) && (
            <View style={{ marginTop: 6, height: 4, backgroundColor: '#ddd', borderRadius: 2, overflow: 'hidden' }}>
              <View style={{ height: 4, width: `${Math.round((message as any).uploadProgress)}%`, backgroundColor: '#4ea1ff' }} />
            </View>
          )}
          <View style={{ flexDirection: 'row', marginTop: 6, alignItems: 'center', justifyContent: isMyMessage ? 'flex-end' : 'flex-start' }}>
            <TouchableOpacity onPress={(evt: any) => {
              setReactingTo(message)
              try {
                const y = (evt?.nativeEvent?.pageY || 100) - 50
                const x = (evt?.nativeEvent?.pageX || 160)
                setReactionAnchor({ x, y })
              } catch { setReactionAnchor({ x: 160, y: 120 }) }
            }} style={{ backgroundColor: '#f5f5f5', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ fontSize: 12 }}>😊</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </TouchableOpacity>
      </SwipeReply>
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
    <View style={styles.container}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 12,
          borderBottomWidth: 1,
          borderBottomColor: "#f3f3f3",
        }}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <Icon name="chevron-left" size={28} color="#333" />
        </TouchableOpacity>
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <View>
            <Avatar.Image size={40} source={{ uri: headerInfo.avatar }} />
            {params.chatType === 'direct' && onlineUsers.has(params.chatId) && (
              <View style={{ position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: '#4CAF50', borderWidth: 2, borderColor: '#fff', shadowColor: '#4CAF50', shadowOpacity: 0.9, shadowRadius: 6 }} />
            )}
          </View>
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.nameText}>{headerInfo.name}</Text>
            {params.chatType === 'direct' ? (
              <PresenceBadge isOnline={onlineUsers.has(params.chatId)} lastSeen={undefined} size="sm" customStatus={undefined} />
            ) : (
              <Text style={[styles.statusText]}>{headerInfo.status}</Text>
            )}
          </View>
          <TouchableOpacity onPress={() => setSearchOpen((v) => !v)}>
            <Icon name={searchOpen ? "close" : "search"} size={22} color="#666" />
          </TouchableOpacity>
        </View>
      </View>

      {searchOpen && (
        <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f3f3', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f2f2f2', borderRadius: 10, paddingHorizontal: 10 }}>
            <Icon name="search" size={18} color="#777" />
            <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Search in conversation" placeholderTextColor="#999" style={{ flex: 1, height: 38, color: '#000', marginLeft: 6 }} />
          </View>
          <TouchableOpacity onPress={() => jumpToMatch(-1)} disabled={searchMatches.length === 0}><Icon name="keyboard-arrow-up" size={22} color={searchMatches.length ? '#333' : '#bbb'} /></TouchableOpacity>
          <TouchableOpacity onPress={() => jumpToMatch(1)} disabled={searchMatches.length === 0}><Icon name="keyboard-arrow-down" size={22} color={searchMatches.length ? '#333' : '#bbb'} /></TouchableOpacity>
          <Text style={{ color: '#666', width: 52, textAlign: 'right' }}>{searchMatches.length ? `${searchIndex + 1}/${searchMatches.length}` : ''}</Text>
        </View>
      )}

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
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <TouchableOpacity onPress={() => setInputText((t) => t + ' 😀')} style={[styles.attachButton]}>
              <Icon name="insert-emoticon" size={22} color="#333" />
            </TouchableOpacity>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Message..."
              placeholderTextColor="#999"
              value={inputText}
              onChangeText={handleTextChange}
              multiline
              maxLength={500}
            />
          </View>
        )}
        <TouchableOpacity onPress={async () => { setEphemeralMode((v) => { const nv = !v; try { AsyncStorage.setItem(ephemeralKey, nv ? '1' : '0') } catch {}; return nv }) }} style={[styles.attachButton]}>
          <Icon name={ephemeralMode ? 'timer' : 'timer-off'} size={22} color={ephemeralMode ? '#d32f2f' : '#333'} />
        </TouchableOpacity>
        {ephemeralMode && (
          <TouchableOpacity onPress={async () => setShowTtlPicker(true)} style={[styles.attachButton]}> 
            <Icon name="update" size={20} color="#333" />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onAttachPress} style={[styles.attachButton]}>
          <Icon name="attach-file" size={22} color="#333" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPollComposerOpen((v) => !v)} style={[styles.attachButton]}>
          <Icon name="bar-chart" size={22} color={pollComposerOpen ? '#007AFF' : '#333'} />
        </TouchableOpacity>
        <TouchableOpacity
          onPressIn={startHoldRecording}
          onPressOut={() => stopHoldRecording(holdDx > -60)}
          onPress={(e: any) => { try { setHoldDx(e?.nativeEvent?.pageX || 0) } catch {} }}
          onLongPress={() => {}}
          delayLongPress={50}
          onResponderMove={(evt: any) => { try { setHoldDx(Math.min(0, (evt?.nativeEvent?.locationX || 0) - 80)) } catch {} }}
          style={[styles.attachButton]}
        >
          <Icon name="mic" size={22} color="#333" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={sendMessage}
          style={[
            styles.sendButton,
            { opacity: (pollComposerOpen || inputText.trim()) ? 1 : 0.5 },
          ]}
          disabled={!(pollComposerOpen || inputText.trim())}
        >
          <Icon name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      {/* Poll composer modal */}
      <Modal visible={pollComposerOpen} animationType="slide" transparent onRequestClose={() => setPollComposerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ maxHeight: Math.round(Dimensions.get('window').height * 0.85), backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 12 }}>
              <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontWeight: '700', fontSize: 18, color: '#111' }}>Create a poll</Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => setPollComposerOpen(false)}>
                  <Icon name="close" size={22} color="#333" />
                </TouchableOpacity>
              </View>
              <View style={{ height: 1, backgroundColor: '#eee' }} />
              <ScrollView style={{ paddingHorizontal: 16, paddingTop: 10 }} keyboardShouldPersistTaps="handled">
                <TextInput placeholder="Question" placeholderTextColor="#888" value={pollQuestion} onChangeText={setPollQuestion} style={[styles.input, { height: 46 }]} />
                {(pollOptions || []).map((opt, idx) => (
                  <View key={String(idx)} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                    <TextInput placeholder={`Option ${idx + 1}`} placeholderTextColor="#999" value={opt} onChangeText={(t) => setPollOptions((prev) => { const next = [...prev]; next[idx] = t; return next })} style={[styles.input, { flex: 1, height: 42 }]} />
                    {idx >= 2 && (
                      <TouchableOpacity onPress={() => setPollOptions((prev) => prev.filter((_, i) => i !== idx))} style={{ marginLeft: 8 }}>
                        <Icon name="remove-circle-outline" size={22} color="#d32f2f" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                  <TouchableOpacity onPress={() => setPollOptions((prev) => [...prev, ''])}>
                    <Text style={{ color: '#007AFF', fontWeight: '600' }}>+ Add option</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity onPress={() => setPollAllowMultiple((v) => !v)}>
                    <Text style={{ color: pollAllowMultiple ? '#007AFF' : '#333' }}>{pollAllowMultiple ? 'Multiple choice' : 'Single choice'}</Text>
                  </TouchableOpacity>
                  <Text style={{ marginHorizontal: 10, color: '#aaa' }}>|</Text>
                  <TouchableOpacity onPress={() => setPollAllowChange((v) => !v)}>
                    <Text style={{ color: pollAllowChange ? '#333' : '#d32f2f' }}>{pollAllowChange ? 'Can change vote' : 'No changes'}</Text>
                  </TouchableOpacity>
                </View>
                {!!inputText && (
                  <Text style={{ color: '#666', marginTop: 10 }}>This poll will include message: “{inputText}”</Text>
                )}
                <View style={{ height: 18 }} />
              </ScrollView>
              <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
                <TouchableOpacity onPress={sendMessage} style={{ height: 46, backgroundColor: '#007AFF', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Send poll</Text>
                </TouchableOpacity>
                <View style={{ height: 8 }} />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      {params.chatType === "group" && <GroupInfoModal />}
      {mediaViewer.visible && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setMediaViewer({ visible: false, url: '', type: 'image' })}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => setMediaViewer({ visible: false, url: '', type: 'image' })} style={{ position: 'absolute', top: 40, right: 20 }}>
              <Icon name="close" size={28} color="#fff" />
            </TouchableOpacity>
            {mediaViewer.type === 'image' ? (
              <Image source={{ uri: mediaViewer.url }} style={{ width: '92%', height: '70%', resizeMode: 'contain' as any, backgroundColor: '#111' }} />
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
      {showTtlPicker && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setShowTtlPicker(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 12, width: 260 }}>
              <Text style={{ fontWeight: '800', fontSize: 16, marginBottom: 8, color: '#000' }}>Ephemeral duration</Text>
              {[30,60,300,3600].map((opt) => (
                <TouchableOpacity key={opt} onPress={async () => { try { await AsyncStorage.setItem(`${ephemeralKey}_ttl`, String(opt)); setShowTtlPicker(false) } catch {} }} style={{ paddingVertical: 10 }}>
                  <Text style={{ color: '#000' }}>{opt < 60 ? `${opt}s` : opt < 3600 ? `${opt/60}m` : `${opt/3600}h`}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setShowTtlPicker(false)} style={{ marginTop: 10, alignSelf: 'flex-end' }}>
                <Text style={{ color: '#007aff', fontWeight: '700' }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
      {reactingTo && reactionAnchor && (
        <ReactionsBar
          x={reactionAnchor.x}
          y={reactionAnchor.y}
          onSelect={async (emoji) => {
            const msgId = (reactingTo as any)?.id
            // optimistic UI update
            setMessages((prev) => prev.map((m) => {
              if (m.id !== msgId) return m
              const cur = Array.isArray((m as any).reactions) ? (m as any).reactions.slice() : []
              const mineId = String(currentUser?._id || '')
              const filtered = cur.filter((r: any) => String(r?.userId || r?.user) !== mineId)
              filtered.push({ type: emoji, userId: mineId })
              return { ...(m as any), reactions: filtered }
            }))
            // fire and forget server
            try { await apiService.request(`/messages/${msgId}/react`, { method: 'POST', body: JSON.stringify({ type: emoji }) }) } catch {}
            setReactingTo(null)
            setReactionAnchor(null)
          }}
          onClose={() => { setReactingTo(null); setReactionAnchor(null) }}
        />
      )}
      {cancelHintVisible && isRecording && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 120, alignItems: 'center' }}>
          <View style={{ backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{holdDx <= -60 ? 'Release to cancel' : 'Slide left to cancel'}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 2, marginTop: 8 }}>
            {Array.from({ length: 32 }).map((_, i) => {
              const h = 8 + ((i % 6) * 3)
              const pulse = Math.max(0.5, Math.min(1.4, 0.5 + Math.sin((Date.now()/120 + i) % (Math.PI*2))))
              return <View key={i} style={{ width: 3, height: Math.round(h * pulse), backgroundColor: '#ff6b6b', borderRadius: 2 }} />
            })}
          </View>
        </View>
      )}
    </View>
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
  messageContent: {
    maxWidth: "86%",
    padding: 12,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  myMessageGradient: {
    borderTopRightRadius: 4,
  },
  otherMessageGradient: {
    borderTopLeftRadius: 4,
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
    position: 'absolute',
    right: 16,
    bottom: 96,
    backgroundColor: '#111',
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    elevation: 4,
  },
  scrollToBottomText: { color: '#fff', fontWeight: '800', marginLeft: 6 },
  unreadDividerContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8 },
  unreadDividerLine: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  unreadDividerText: { color: '#111', fontWeight: '800', fontSize: 12 },
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
    backgroundColor: "#fafafa",
    borderTopWidth: 1,
    borderTopColor: "#eee",
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
    borderWidth: 0,
    borderRadius: 14,
    marginRight: 10,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: "#fff",
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
})