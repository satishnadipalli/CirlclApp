"use client"

import type { Chat } from "@/types/chat.types"
import { useRouter } from "expo-router"
import type React from "react"
import { StyleSheet, Text, View } from "react-native"
import { Avatar, Badge, List } from "react-native-paper"
import PresenceBadge from "./PresenceBadge"

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
          presenceText: undefined,
        }
      }

      const hasAttachment = Array.isArray(chat.lastMessage?.attachments) && chat.lastMessage.attachments.length > 0
      const preview = chat.lastMessage?.text && chat.lastMessage.text.trim().length > 0
        ? chat.lastMessage.text
        : (hasAttachment ? (/(video)/i.test(String(chat.lastMessage?.attachments?.[0]?.type || '')) ? 'Video' : 'Photo') : 'No messages yet')
      // Presence
      let presenceText: string | undefined = undefined
      const p = chat.__presence
      if (p && typeof p === 'object') {
        if (p.isOnline) presenceText = 'Online'
        else if (p.lastSeen) {
          const d = new Date(p.lastSeen)
          const now = Date.now()
          const diff = Math.max(0, now - d.getTime())
          const mins = Math.floor(diff / 60000)
          if (mins < 1) presenceText = 'Last seen just now'
          else if (mins < 60) presenceText = `Last seen ${mins}m ago`
          else if (mins < 60 * 24) presenceText = `Last seen ${Math.floor(mins / 60)}h ago`
          else presenceText = `Last seen ${Math.floor(mins / (60 * 24))}d ago`
        }
      }
      return {
        name: participant.name || "Unknown User",
        avatar: participant.profilePic || `https://i.pravatar.cc/150?u=${participant._id}`,
        lastMessage: preview,
        chatId: participant._id,
        chatType: "direct" as const,
        presenceText,
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
      const senderName = (chat.lastMessageFromName && String(chat.lastMessageFromName).trim())
        || ((chat.lastMessage?.from && (chat.lastMessage.from as any)?.name) ? (chat.lastMessage.from as any).name : '')
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

  const description = typingText && typingText.length > 0 ? typingText : chatInfo.lastMessage

  const presence = chat.chatType === 'direct' ? (chat.__presence || {}) : null
  const isOnline = !!presence?.isOnline
  const lastSeen = presence?.lastSeen

  return (
    <List.Item
      title={chatInfo.name}
      description={() => (
        chatInfo.chatType === 'direct' ? (
          <PresenceBadge isOnline={isOnline} lastSeen={lastSeen} size="sm" />
        ) : (
          <Text numberOfLines={1} style={typingText && typingText.length > 0 ? styles.typingDescription : undefined}>{description}</Text>
        )
      )}
      descriptionStyle={undefined}
      onPress={handlePress}
      left={() => <Avatar.Image size={50} source={{ uri: chatInfo.avatar }} />}
      right={() => (
        <View style={styles.rightContainer}>
          <Text style={styles.timeText}>{time}</Text>
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
