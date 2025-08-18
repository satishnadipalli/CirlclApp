import { useNotification } from "@/contexts/NotificationContext"


// Custom hook to easily access notification functionality
export const useGlobalNotification = () => {
  const { unreadCount, showNotification, socket } = useNotification()

  const triggerTestNotification = () => {
    showNotification({
      type: "like",
      message: "Someone liked your post!",
      user: { name: "Test User" },
    })
  }

  return {
    unreadCount,
    showNotification,
    socket,
    triggerTestNotification,
  }
}
