import AsyncStorage from "@react-native-async-storage/async-storage"

class ApiService {
  constructor() {
    this.baseURL = "http://192.168.81.127:5000/api"
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
        throw new Error(data.message || "Request failed")
      }

      console.log("+++++++++++++++++",data)
      return {
        success: true,
        ...data,
      }
    } catch (error) {
      console.error(`API Error (${endpoint}):`, error)
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
  async getUserProfile(userId) {
    return this.request(`/users/${userId}`)
  }

  async updateProfile(profileData) {
    return this.request("/users/profile", {
      method: "PUT",
      body: JSON.stringify(profileData),
    })
  }

  // Auth Methods
  async login(email, password) {
    return this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    })
  }

  async register(name, email, password) {
    return this.request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    })
  }

  async logout() {
    return this.request("/auth/logout", {
      method: "POST",
    })
  }
}

const apiService = new ApiService()

export { apiService }
export default apiService
