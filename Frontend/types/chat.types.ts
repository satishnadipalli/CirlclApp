// Base User interface
export interface User {
  _id: string
  name: string
  email?: string
  profilePic?: string
  createdAt?: string
  updatedAt?: string
}

// Base Message interface
export interface Message {
  _id: string
  text: string
  from: User
  to?: User
  group?: string
  messageType: "direct" | "group"
  isRead?: boolean
  createdAt: string
  updatedAt?: string
}

// Specialized message types
export interface DirectMessage extends Message {
  to: User
  messageType: "direct"
}

export interface GroupMessage extends Message {
  group: string
  messageType: "group"
}

// Group interface
export interface Group {
  _id: string
  name: string
  description?: string
  creator: string
  admins: string[]
  members: User[]
  groupPic?: string
  isActive: boolean
  createdAt: string
  updatedAt?: string
}

// Chat interfaces
export interface DirectChat {
  _id: string
  type: "direct"
  participant: User
  lastMessage?: DirectMessage
  unreadCount?: number
  updatedAt: string
}

export interface GroupChat {
  _id: string
  type: "group"
  group: Group
  lastMessage?: GroupMessage
  unreadCount?: number
  updatedAt: string
}

// Union type for all chat types
export type Chat = DirectChat | GroupChat

// Typing indicator interface
export interface TypingUser {
  _id: string
  name: string
}

// Navigation parameters
export interface ChatParams {
  chatId: string
  chatType: "direct" | "group"
  chatName?: string
  participantId?: string
  groupId?: string
}

// API Response interfaces
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

export interface GetChatsResponse extends ApiResponse {
  chats: Chat[]
}

export interface GetMessagesResponse extends ApiResponse {
  messages: Message[]
  hasMore?: boolean
  nextCursor?: string
}

export interface GetGroupResponse extends ApiResponse {
  group: Group
}

export interface SendMessageResponse extends ApiResponse {
  message: Message
}

// Socket event data interfaces
export interface SocketMessageData {
  _id?: string
  from: string
  to?: string
  group?: string
  text: string
  messageType: "direct" | "group"
  createdAt?: string
}

export interface SocketTypingData {
  from: string
  to?: string
  groupId?: string
  name: string
}

export interface SocketUserStatusData {
  userId: string
  status: "online" | "offline"
}

// Form interfaces
export interface CreateGroupForm {
  name: string
  description?: string
  members: string[]
}

export interface SendMessageForm {
  text: string
  to?: string
  group?: string
  messageType: "direct" | "group"
}

// User authentication interfaces
export interface LoginForm {
  email: string
  password: string
}

export interface RegisterForm {
  name: string
  email: string
  password: string
  confirmPassword?: string
}

export interface AuthUser extends User {
  token: string
}

// Pagination interfaces
export interface PaginationParams {
  page?: number
  limit?: number
  cursor?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  hasMore: boolean
  nextCursor?: string
  totalCount?: number
}

// Error interfaces
export interface ApiError {
  message: string
  code?: string
  field?: string
}

// Chat screen state interfaces
export interface ChatScreenState {
  messages: Message[]
  isLoading: boolean
  isConnected: boolean
  typingUsers: TypingUser[]
  onlineUsers: Set<string>
  currentUser: User | null
  otherUser?: User | null
  group?: Group | null
}

// Group management interfaces
export interface GroupMember extends User {
  isAdmin: boolean
  joinedAt?: string
}

export interface GroupInfo extends Group {
  memberCount: number
  adminCount: number
  onlineMembers: string[]
}

// Message status enums
export enum MessageStatus {
  SENDING = "sending",
  SENT = "sent",
  DELIVERED = "delivered",
  READ = "read",
  FAILED = "failed",
}

// Chat type enums
export enum ChatType {
  DIRECT = "direct",
  GROUP = "group",
}

// User status enums
export enum UserStatus {
  ONLINE = "online",
  OFFLINE = "offline",
  AWAY = "away",
  BUSY = "busy",
}

// Socket event names
export enum SocketEvents {
  // Connection events
  CONNECT = "connect",
  DISCONNECT = "disconnect",
  REGISTER = "register",

  // Message events
  SEND_MESSAGE = "sendMessage",
  RECEIVE_DIRECT_MESSAGE = "receiveDirectMessage",
  SEND_GROUP_MESSAGE = "sendGroupMessage",
  RECEIVE_GROUP_MESSAGE = "receiveGroupMessage",

  // Typing events
  TYPING = "typing",
  STOP_TYPING = "stopTyping",
  GROUP_TYPING = "groupTyping",
  GROUP_STOP_TYPING = "groupStopTyping",

  // Group events
  JOIN_GROUP = "joinGroup",
  LEAVE_GROUP = "leaveGroup",

  // User status events
  USER_STATUS_CHANGE = "userStatusChange",
}

// Utility types
export type MessageWithUser = Message & {
  fromUser: User
  toUser?: User
}

export type ChatWithLastMessage = Chat & {
  lastMessage: Message
  lastMessageTime: string
}

// Component prop types
export interface ChatListItemProps {
  chat: Chat
  onPress: (chat: Chat) => void
  currentUserId: string
}

export interface MessageBubbleProps {
  message: Message
  isMyMessage: boolean
  showAvatar?: boolean
  showTimestamp?: boolean
  currentUserId: string
}

export interface TypingIndicatorProps {
  typingUsers: TypingUser[]
  chatType: "direct" | "group"
}

// Hook return types
export interface UseChatReturn {
  messages: Message[]
  sendMessage: (text: string) => Promise<void>
  isLoading: boolean
  error: string | null
  loadMore: () => Promise<void>
  hasMore: boolean
}

export interface UseSocketReturn {
  isConnected: boolean
  connect: () => Promise<void>
  disconnect: () => void
  sendMessage: (message: SocketMessageData) => void
  onMessage: (callback: (message: SocketMessageData) => void) => void
}
