"use client"

import type { Chat } from "@/types/chat.types"
import { useRouter } from "expo-router"
import type React from "react"
import { StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { Avatar, Badge, List } from "react-native-paper"

interface ChatListItemProps {
  chat: Chat
  currentUserId: string
}

export const ChatListItem: React.FC<ChatListItemProps> = ({ chat, currentUserId }) => {
  const router = useRouter()

  const getChatInfo = () => {
    if (chat.chatType === "direct") {
      if (!chat.user) {
        return {
          name: "Unknown User",
          avatar: "https://i.pravatar.cc/150?u=unknown",
          lastMessage: "No messages yet",
          chatId: "unknown",
          chatType: "direct" as const,
        }
      }

      return {
        name: chat.user.name || "Unknown User",
        avatar: chat.user.profilePic || `https://i.pravatar.cc/150?u=${chat.user._id}`,
        lastMessage: chat.lastMessage?.text || "No messages yet",
        chatId: chat.user._id,
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

      return {
        name: chat.group.name || "Unknown Group",
        avatar: chat.group.groupPic || `https://i.pravatar.cc/150?u=${chat.group._id}`,
        lastMessage:
          chat.lastMessage && chat.lastMessage.from
            ? `${chat.lastMessage.from.name || "Unknown"}: ${chat.lastMessage.text}`
            : "No messages yet",
        chatId: chat.group._id,
        chatType: "group" as const,
      }
    }
  }

  const chatInfo = getChatInfo()
  const time = chat.lastMessage
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
    <TouchableOpacity onPress={handlePress}>
      <List.Item
        title={chatInfo.name}
        description={chatInfo.lastMessage}
        left={() => <Avatar.Image size={50} source={{ uri: chatInfo.avatar }} />}
        right={() => (
          <View style={styles.rightContainer}>
            <Text style={styles.timeText}>{time}</Text>
            {chat.unreadCount && chat.unreadCount > 0 && <Badge size={20}>{chat.unreadCount}</Badge>}
          </View>
        )}
        style={styles.listItem}
      />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  listItem: { paddingVertical: 10, paddingHorizontal: 15 },
  rightContainer: { justifyContent: "center", alignItems: "flex-end" },
  timeText: { fontSize: 12, color: "#888", marginBottom: 5 },
})
