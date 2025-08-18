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
} from "react-native"

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
}

interface DateHeader {
  id: string
  type: "date"
  date: string
  displayText: string
}

type ChatItem = ChatMessage | DateHeader

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
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)

  const flatListRef = useRef<FlatList>(null)
  const messageIndexByIdRef = useRef<Map<string, number>>(new Map())
  const messageByIdRef = useRef<Map<string, ChatMessage>>(new Map())
  const socketRef = useRef<any>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const currentUserRef = useRef<User | null>(null)
  const otherUserRef = useRef<User | null>(null)
  const groupRef = useRef<Group | null>(null)
  const messageListenerRef = useRef<((msg: any) => void) | null>(null)
  const typingListenerRef = useRef<((data: any) => void) | null>(null)
  const stopTypingListenerRef = useRef<((data: any) => void) | null>(null)
  const userStatusListenerRef = useRef<((data: any) => void) | null>(null)
  const isUserAtBottomRef = useRef<boolean>(true)
  const router = useRouter()
  const params = useLocalSearchParams() as unknown as ChatParams

  const dot1Opacity = useRef(new Animated.Value(0.3)).current
  const dot2Opacity = useRef(new Animated.Value(0.3)).current
  const dot3Opacity = useRef(new Animated.Value(0.3)).current

  const loadUserAndInitialize = async () => {
    try {
      const [userData, token] = await Promise.all([AsyncStorage.getItem("user"), AsyncStorage.getItem("token")])

      if (userData) {
        const parsedUser = JSON.parse(userData)
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
            name: (params as any).name || (params as any).chatName || "",
            profilePic: "",
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
          }

          console.log("[v0] Processing socket message:", baseMessage)

          setMessages((prev) => {
            // If we already have this server message, skip
            const exists = prev.find((m) => m.id === baseMessage.id)
            if (exists) return prev

            // Merge with a matching local temp message to avoid duplicates
            let newMessage = baseMessage
            if (newMessage.sender === "me") {
              const idx = prev.findIndex(
                (m) =>
                  m.sender === "me" &&
                  m.id.startsWith("temp-") &&
                  m.text === newMessage.text &&
                  Math.abs(new Date(m.createdAt || 0).getTime() - new Date(newMessage.createdAt || 0).getTime()) < 15000,
              )
              if (idx > -1) {
                const next = [...prev]
                next[idx] = newMessage
                return next
              }
            }

            // Link reply when possible using current map
            if ((msg as any).replyTo) {
              const replyId = typeof (msg as any).replyTo === "object" ? (msg as any).replyTo._id || (msg as any).replyTo.id : (msg as any).replyTo
              const replied = messageByIdRef.current.get(replyId)
              if (replied) {
                (newMessage as any).replyTo = replied
              } else {
                (newMessage as any).replyTo = (msg as any).replyTo
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
            replyTo: (msg as any).replyTo || undefined,
          }))
          console.log("[v0] Loaded direct messages:", formattedMessages.length)
          setMessages(formattedMessages)

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
            replyTo: (msg as any).replyTo || undefined,
          }))
          console.log("[v0] Loaded group messages:", formattedMessages.length)
          setMessages(formattedMessages)
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
    // Auto-close reply preview immediately on send
    setReplyingTo(null)

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
    messageIndexByIdRef.current.clear()
    messageByIdRef.current.clear()

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
      messageIndexByIdRef.current.set(message.id, items.length - 1)
      messageByIdRef.current.set(message.id, message)
    })

    return items
  }

  const resolveReplyMeta = (reply: any) => {
    if (!reply) return { id: undefined as string | undefined, name: "", text: "" }
    if (typeof reply === "string") {
      const m = messageByIdRef.current.get(reply)
      return { id: reply, name: m?.from?.name || "Replied", text: m?.text || "" }
    }
    const id = reply._id || reply.id
    const name = reply.from?.name || "Replied"
    const text = reply.text || ""
    return { id, name, text }
  }

  const scrollToMessageWithHighlight = (messageId: string) => {
    const index = messageIndexByIdRef.current.get(messageId)
    if (index == null) return
    try {
      flatListRef.current?.scrollToIndex({ index, animated: true })
      setHighlightedMessageId(messageId)
      setTimeout(() => setHighlightedMessageId((cur) => (cur === messageId ? null : cur)), 1800)
    } catch (e) {
      // fallback: scroll to end if index invalid
      flatListRef.current?.scrollToEnd({ animated: true })
    }
  }

  useEffect(() => {
    const processedItems = processMessagesWithDates(messages)
    setChatItems(processedItems)
    // mark read when we are at bottom and there are messages
    if (currentUser && params.chatId && params.chatType === "direct") {
      apiService.markDirectRead(params.chatId).catch(() => {})
    } else if (params.chatType === "group") {
      apiService.markGroupRead(params.chatId).catch(() => {})
    }
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

    const message = item as ChatMessage
    const messageTime = message.createdAt ? formatTime(new Date(message.createdAt)) : ""
    const isMyMessage = message.sender === "me"
    const isHighlighted = highlightedMessageId && message.id === highlightedMessageId
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onLongPress={() => setReplyingTo(message)}
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
            isHighlighted ? styles.highlightedMessage : {},
          ]}
        >
          {params.chatType === "group" && !isMyMessage && (
            <Text style={[styles.senderName, { color: getUserColor(message.from._id) }]}>{message.from.name}</Text>
          )}

          {"replyTo" in (message as any) && (message as any).replyTo && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                const meta = resolveReplyMeta((message as any).replyTo)
                if (meta.id) scrollToMessageWithHighlight(meta.id)
              }}
              style={styles.replyChip}
            >
              <View style={[styles.replyBar, { backgroundColor: isMyMessage ? "#9bd7a1" : "#bbb" }]} />
              {(() => {
                const meta = resolveReplyMeta((message as any).replyTo)
                return (
                  <Text style={styles.replyInline} numberOfLines={1}>
                    {`${meta.name}: ${meta.text}`}
                  </Text>
                )
              })()}
            </TouchableOpacity>
          )}

          <Text style={[styles.messageText, isMyMessage ? styles.myMessageText : styles.otherMessageText]}>
            {message.text}
          </Text>

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
                      {group.admins.includes(member._id) ? " • Admin" : ""}
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
          onPress={() => params.chatType === "group" && setShowGroupInfo(true)}
          disabled={params.chatType === "direct"}
        >
          <Avatar.Image size={40} source={{ uri: headerInfo.avatar }} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.nameText}>{headerInfo.name}</Text>
            <Text style={styles.statusText}>{headerInfo.status}</Text>
          </View>
          {params.chatType === "group" && <Icon name="info" size={24} color="#666" />}
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

        {replyingTo && (
          <View style={styles.replyPreviewContainer}>
            <View style={styles.replyPreviewInner}>
              <View style={[styles.replyBar, { backgroundColor: "#0095f6" }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.replyName}>{replyingTo.from.name}</Text>
                <Text style={styles.replyText} numberOfLines={1}>{replyingTo.text}</Text>
              </View>
              <TouchableOpacity onPress={() => setReplyingTo(null)}>
                <Icon name="close" size={18} color="#666" />
              </TouchableOpacity>
            </View>
          </View>
        )}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Message..."
            placeholderTextColor="#999"
            value={inputText}
            onChangeText={handleTextChange}
            multiline
            maxLength={500}
          />
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
      </KeyboardAvoidingView>
    
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop:40
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
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fff",
    borderRadius: 25,
    marginHorizontal: 10,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
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
  replyPreviewContainer: {
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  replyPreviewInner: {
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
  replyChip: {
    backgroundColor: "#e8e8e8",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "100%",
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
  replyInline: {
    fontSize: 12,
    color: "#333",
    flexShrink: 1,
  },
  highlightedMessage: {
    borderWidth: 1,
    borderColor: "#0095f6",
    backgroundColor: "#e9f4ff",
  },
  input: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    color: "#000",
    maxHeight: 100, // limits multiline expansion
  },
  sendButton: {
    backgroundColor: "#0095f6", // Instagram blue
    borderRadius: 25,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
})
