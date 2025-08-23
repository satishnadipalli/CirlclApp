import AsyncStorage from "@react-native-async-storage/async-storage"

class ApiService {
  constructor() {
    this.baseURL = require("../constants/Config").API_BASE_URL
    this.token = null
    this.initializeToken()
  }

  async initializeToken() {
    try {
      const token = await AsyncStorage.getItem("token")
      if (token) {
        this.token = token
      }
    } catch (error) {
      console.error("Error loading token:", error)
    }
  }

  setToken(token) {
    this.token = token
  }

  async getHeaders() {
    const headers = {
      "Content-Type": "application/json",
    }

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`
    } else {
      try {
        const storedToken = await AsyncStorage.getItem("token")
        if (storedToken) {
          headers.Authorization = `Bearer ${storedToken}`
        }
      } catch (error) {
        console.error("Error getting token from storage:", error)
      }
    }

    return headers
  }

  async request(endpoint, options = {}) {
    try {
      const headers = await this.getHeaders()

      const response = await fetch(`${this.baseURL}${endpoint}`, {
        ...options,
        headers: {
          ...headers,
          ...options.headers,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        // Gracefully handle expected 404/403 (e.g., no daily entry or locked)
        if (response.status === 404 || response.status === 403) {
          return {
            success: false,
            status: response.status,
            message: (data && (data.message || data.error)) || (response.status === 404 ? "Not found" : "Forbidden"),
          }
        }
        throw new Error(data.message || "Request failed")
      }

      return {
        success: true,
        ...data,
      }
    } catch (error) {
      // Avoid noisy logs for handled cases
      if (!(error instanceof Error && (error.message === "Not found" || error.message === "Forbidden"))) {
        console.error(`API Error (${endpoint}):`, error)
      }
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error occurred",
      }
    }
  }

  // Chat Methods
  async getChats() {
    return this.request("/messages/chats")
  }

  // Explore
  async getExplore(page = 1, limit = 18) {
    try {
      const coordsRaw = await AsyncStorage.getItem("user_coords")
      let qp = `page=${page}&limit=${limit}`
      if (coordsRaw) {
        try {
          const c = JSON.parse(coordsRaw)
          if (c?.lat != null && c?.lng != null) qp += `&lat=${c.lat}&lng=${c.lng}`
        } catch {}
      }
      return this.request(`/posts/explore?${qp}`)
    } catch {
      return this.request(`/posts/explore?page=${page}&limit=${limit}`)
    }
  }

  // Daily Circle
  async getDailyPrompt() {
    return this.request(`/daily/prompt`)
  }
  async postDailyEntry({ text, fileUri, visibility = "followers" }: { text?: string; fileUri?: string; visibility?: string }) {
    try {
      // Only set Authorization for multipart; do NOT set Content-Type
      let authHeader: any = {}
      const token = this.token || (await AsyncStorage.getItem("token"))
      if (token) authHeader = { Authorization: `Bearer ${token}` }
      const formData = new FormData()
      if (fileUri) {
        const isVideo = /\.(mp4|mov|avi)$/i.test(fileUri)
        formData.append("file", {
          uri: fileUri as any,
          type: isVideo ? "video/mp4" : "image/jpeg",
          name: `daily.${isVideo ? "mp4" : "jpg"}`,
        } as any)
      }
      if (text) formData.append("text", text)
      formData.append("visibility", visibility)

      const response = await fetch(`${this.baseURL}/daily/entry`, {
        method: "POST",
        headers: authHeader,
        body: formData as any,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || "Failed to post daily entry")
      return { success: true, ...data }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : "Failed" }
    }
  }
  async postGroupDailyEntry(groupId: string, { text, fileUri }: { text?: string; fileUri?: string }) {
    try {
      let authHeader: any = {}
      const token = this.token || (await AsyncStorage.getItem("token"))
      if (token) authHeader = { Authorization: `Bearer ${token}` }
      const formData = new FormData()
      if (fileUri) {
        const isVideo = /\.(mp4|mov|avi)$/i.test(fileUri)
        formData.append("file", {
          uri: fileUri as any,
          type: isVideo ? "video/mp4" : "image/jpeg",
          name: `daily.${isVideo ? "mp4" : "jpg"}`,
        } as any)
      }
      if (text) formData.append("text", text)
      formData.append("visibility", "group")
      formData.append("group", String(groupId))

      const response = await fetch(`${this.baseURL}/daily/entry`, {
        method: "POST",
        headers: authHeader,
        body: formData as any,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || "Failed to post group daily entry")
      return { success: true, ...data }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : "Failed" }
    }
  }
  async getDailyFeed() {
    try {
      const headers = await this.getHeaders()
      const res = await fetch(`${this.baseURL}/daily/feed`, { headers })
      const data = await res.json()
      if (res.status === 403) {
        return { success: false, locked: true, message: data?.message || "Locked" }
      }
      if (!res.ok) {
        return { success: false, message: data?.message || "Failed" }
      }
      return { success: true, ...data }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : "Failed" }
    }
  }
  async getGroupDailyFeed(groupId: string) {
    return this.request(`/daily/group/${groupId}`)
  }
  async getDailyStreak() { return this.request(`/daily/streak`) }
  async getDailyRings() { return this.request(`/daily/rings`) }
  async getDailyEntryByUser(userId: string) { return this.request(`/daily/entry/${userId}`) }
  async dailyView(entryId: string) { return this.request(`/daily/view`, { method: 'POST', body: JSON.stringify({ entryId }) }) }
  async dailyReact(entryId: string, type?: string | null) { return this.request(`/daily/react`, { method: 'POST', body: JSON.stringify({ entryId, type: type ?? null }) }) }
  async dailyHighlight(entryId: string, on: boolean) { return this.request(`/daily/highlight`, { method: 'POST', body: JSON.stringify({ entryId, on }) }) }
  async getDailyHighlights() { return this.request(`/daily/highlights`) }
  async getDailyReactions(entryId: string) { return this.request(`/daily/${entryId}/reactions`) }
  async getDailyReactors(entryId: string, type?: string, page = 1, limit = 30) {
    const t = type ? `&type=${encodeURIComponent(type)}` : ""
    return this.request(`/daily/${entryId}/reactors?page=${page}&limit=${limit}${t}`)
  }
  async getDailyCaptions(entryId: string) { return this.request(`/daily/${entryId}/captions`) }
  async putDailyCaptions(entryId: string, captions: Array<{ start: number; end: number; text: string }>) {
    return this.request(`/daily/${entryId}/captions`, { method: 'PUT', body: JSON.stringify({ captions }) })
  }

  async getDirectMessages(withUserId) {
    return this.request(`/messages/direct/${withUserId}`)
  }

  async sendDirectMessage(toUserId, text, replyTo) {
    return this.request("/messages", {
      method: "POST",
      body: JSON.stringify({
        to: toUserId,
        text,
        messageType: "direct",
        replyTo,
      }),
    })
  }

  async markDirectRead(peerId) {
    return this.request(`/messages/direct/${peerId}/read`, { method: "POST" })
  }

  async markGroupRead(groupId) {
    return this.request(`/messages/group/${groupId}/read`, { method: "POST" })
  }

  // Group Methods
  async createGroup(name, description, memberIds) {
    return this.request("/groups", {
      method: "POST",
      body: JSON.stringify({
        name,
        description,
        members: memberIds,
      }),
    })
  }

  async getUserGroups() {
    return this.request("/groups")
  }

  async getGroupInfo(groupId) {
    return this.request(`/groups/${groupId}`)
  }

  async getGroupMessages(groupId) {
    return this.request(`/groups/${groupId}/messages`)
  }

  async sendGroupMessage(groupId, text, replyTo) {
    return this.request("/messages", {
      method: "POST",
      body: JSON.stringify({
        group: groupId,
        text,
        messageType: "group",
        replyTo,
      }),
    })
  }

  async addGroupMembers(groupId, memberIds) {
    return this.request(`/groups/${groupId}/members`, {
      method: "POST",
      body: JSON.stringify({
        members: memberIds,
      }),
    })
  }

  async removeGroupMember(groupId, memberId) {
    return this.request(`/groups/${groupId}/members/${memberId}`, {
      method: "DELETE",
    })
  }

  async promoteToAdmin(groupId, memberId) {
    return this.request(`/groups/${groupId}/admins/${memberId}`, {
      method: "POST",
    })
  }

  async demoteAdmin(groupId, adminId) {
    return this.request(`/groups/${groupId}/admins/${adminId}`, {
      method: "DELETE",
    })
  }

  // User Methods
  async getMe() {
    return this.request("/users/me")
  }
  async getUserProfile(userId) {
    return this.request(`/users/${userId}`)
  }
  async getFollowers(userId, page = 1, limit = 20) {
    try {
      let id = userId
      if (!id) {
        const me = await this.getMe()
        const meObj: any = me
        id = meObj?._id || meObj?.user?._id || null
      }
      if (!id) throw new Error("No user id available")
      return this.request(`/users/${id}/followers?page=${page}&limit=${limit}`)
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : "Failed to resolve user id" }
    }
  }
  async getFollowing(userId, page = 1, limit = 20) {
    try {
      let id = userId
      if (!id) {
        const me = await this.getMe()
        const meObj: any = me
        id = meObj?._id || meObj?.user?._id || null
      }
      if (!id) throw new Error("No user id available")
      return this.request(`/users/${id}/following?page=${page}&limit=${limit}`)
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : "Failed to resolve user id" }
    }
  }
  async searchUsers(q: string, page = 1, limit = 20, groupId?: string) {
    const gid = groupId ? `&groupId=${encodeURIComponent(groupId)}` : ""
    return this.request(`/users/search?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}${gid}`)
  }
  async followUser(userId) {
    return this.request(`/users/${userId}/follow`, { method: "POST" })
  }
  async unfollowUser(userId) {
    return this.request(`/users/${userId}/unfollow`, { method: "POST" })
  }

  async registerPushToken(token: string) {
    return this.request(`/users/me/push-token`, { method: 'POST', body: JSON.stringify({ token }) })
  }
  async blockUser(userId: string) { return this.request(`/users/${userId}/block`, { method: 'POST' }) }
  async unblockUser(userId: string) { return this.request(`/users/${userId}/unblock`, { method: 'POST' }) }
  async report(targetType: 'entry'|'user'|'message'|'post', targetId: string, reason: 'spam'|'abuse'|'nudity'|'violence'|'other', details?: string, targetUser?: string) {
    return this.request(`/safety/report`, { method: 'POST', body: JSON.stringify({ targetType, targetId, reason, details, targetUser }) })
  }

  async updateProfile(profileData: { name?: string; bio?: string; website?: string; profilePic?: string }) {
    return this.request("/users/profile", {
      method: "PUT",
      body: JSON.stringify(profileData),
    })
  }

  async uploadProfilePicture(fileUri: string) {
    try {
      let authHeader: any = {}
      const token = this.token || (await AsyncStorage.getItem("token"))
      if (token) authHeader = { Authorization: `Bearer ${token}` }
      const formData = new FormData()
      formData.append("file", {
        uri: fileUri as any,
        type: "image/jpeg",
        name: "avatar.jpg",
      } as any)
      const response = await fetch(`${this.baseURL}/upload`, { method: 'POST', headers: authHeader, body: formData as any })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.message || 'Failed to upload profile picture')
      return { success: true, ...data }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Failed' }
    }
  }

  // Auth Methods
  async login(email, password) {
    return this.request("/users/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    })
  }

  async register(name, email, password) {
    return this.request("/users/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    })
  }

  async getNotifications(page = 1, limit = 20) {
    return this.request(`/notifications?page=${page}&limit=${limit}`)
  }
  async getUnreadNotificationsCount() {
    return this.request(`/notifications/unread-count`)
  }
  async markNotificationRead(id: string) {
    return this.request(`/notifications/${id}/read`, { method: 'PUT' })
  }
  async markAllNotificationsRead() {
    return this.request(`/notifications/read-all`, { method: 'PUT' })
  }
  async deleteNotification(id: string) {
    return this.request(`/notifications/${id}`, { method: 'DELETE' })
  }

  async getPostById(id: string) {
    return this.request(`/posts/${id}`)
  }

  async getSavedPosts() {
    return this.request(`/posts/saved`)
  }

  async likePost(postId: string) {
    return this.request(`/posts/${postId}/like`, { method: 'PUT' })
  }
  async addComment(postId: string, text: string) {
    return this.request(`/posts/${postId}/comment`, { method: 'POST', body: JSON.stringify({ text }) })
  }
}

const apiService = new ApiService()

export { apiService }
export default apiService