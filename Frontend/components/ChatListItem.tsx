"use client"

import type { Chat } from "@/types/chat.types"
import { useRouter } from "expo-router"
import type React from "react"
import { StyleSheet, Text, View } from "react-native"
import { Avatar, Badge, List } from "react-native-paper"

interface ChatListItemProps {
  chat: any
  currentUserId: string
  typingText?: string
}

export const ChatListItem: React.FC<ChatListItemProps> = ({ chat, currentUserId, typingText }) => {
  const router = useRouter()

  const getChatInfo = () => {
    if (chat.chatType === "direct") {
      const participant = chat.user || chat.participant
      if (!participant) {
        return {
          name: "Unknown User",
          avatar: "https://i.pravatar.cc/150?u=unknown",
          lastMessage: "No messages yet",
          chatId: "unknown",
          chatType: "direct" as const,
        }
      }

      const hasAttachment = Array.isArray(chat.lastMessage?.attachments) && chat.lastMessage.attachments.length > 0
      const preview = chat.lastMessage?.text && chat.lastMessage.text.trim().length > 0
        ? chat.lastMessage.text
        : (hasAttachment ? (/(video)/i.test(String(chat.lastMessage?.attachments?.[0]?.type || '')) ? 'Video' : 'Photo') : 'No messages yet')
      return {
        name: participant.name || "Unknown User",
        avatar: participant.profilePic || `https://i.pravatar.cc/150?u=${participant._id}`,
        lastMessage: preview,
        chatId: participant._id,
        chatType: "direct" as const,
      }
    } else {
      if (!chat.group) {
        return {
          name: "Unknown Group",
          avatar: "https://i.pravatar.cc/150?u=unknown",
          lastMessage: "No messages yet",
          chatId: "unknown",
          chatType: "group" as const,
        }
      }

      const hasAttachment = Array.isArray(chat.lastMessage?.attachments) && chat.lastMessage.attachments.length > 0
      const senderName = (chat.lastMessage?.from && (chat.lastMessage.from as any)?.name)
        || (chat.lastMessageFromName || '')
        || 'Unknown'
      const content = chat.lastMessage?.text && chat.lastMessage.text.trim().length > 0
        ? chat.lastMessage.text
        : (hasAttachment ? (/(video)/i.test(String(chat.lastMessage?.attachments?.[0]?.type || '')) ? 'Video' : 'Photo') : 'No messages yet')
      return {
        name: chat.group.name || "Unknown Group",
        avatar: chat.group.groupPic || `https://i.pravatar.cc/150?u=${chat.group._id}`,
        lastMessage: chat.lastMessage ? `${senderName}: ${content}` : 'No messages yet',
        chatId: chat.group._id,
        chatType: "group" as const,
      }
    }
  }

  const chatInfo = getChatInfo()
  const time = chat.lastMessage && chat.lastMessage.createdAt
    ? new Date(chat.lastMessage.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : ""

  const handlePress = () => {
    router.push({
      pathname: `/chats/${chatInfo.chatId}`,
      params: {
        chatId: chatInfo.chatId,
        chatType: chatInfo.chatType,
        name: chatInfo.name,
        avatar: chatInfo.avatar,
        currentUserId,
      },
    })
  }

  return (
    <List.Item
      title={chatInfo.name}
      description={typingText && typingText.length > 0 ? typingText : chatInfo.lastMessage}
      descriptionStyle={typingText && typingText.length > 0 ? styles.typingDescription : undefined}
      onPress={handlePress}
      left={() => <Avatar.Image size={50} source={{ uri: chatInfo.avatar }} />}
      right={() => (
        <View style={styles.rightContainer}>
          <Text style={styles.timeText}>{time}</Text>
          {/* Details button removed; tap header in chat to navigate to info */}
          {chat.unreadCount && chat.unreadCount > 0 ? <Badge size={20}>{String(chat.unreadCount)}</Badge> : null}
        </View>
      )}
      style={styles.listItem}
    />
  )
}

const styles = StyleSheet.create({
  listItem: { paddingVertical: 10, paddingHorizontal: 15 },
  rightContainer: { justifyContent: "center", alignItems: "flex-end" },
  timeText: { fontSize: 12, color: "#888", marginBottom: 5 },
  typingDescription: { color: "#0095f6" },
})
