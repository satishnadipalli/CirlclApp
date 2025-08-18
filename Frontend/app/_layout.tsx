import { NotificationProvider } from "@/contexts/NotificationContext";
import socketService from "@/services/socket.service";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack } from "expo-router";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {

  useEffect(() => {
  async function initSocket() {
    const userData = await AsyncStorage.getItem("user");
    if (!userData) return;

    const parsedUser = JSON.parse(userData);
    console.log(parsedUser)
    await socketService.connect();
    socketService.registerUser(parsedUser.id);

    console.log("[v0] Socket initialized globally:", parsedUser.id);
  }

  initSocket();

  return () => {
    socketService.disconnect();
  };
}, []);



  return (

    <GestureHandlerRootView style={{ flex: 1 }}>
      <NotificationProvider>
      <Stack screenOptions={{ headerShown: false }}>
        {/* Login / Signup screens */}
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />

        {/* Tabs layout (main app) */}
        <Stack.Screen name="(tabs)" />

        {/* Personal chat screen outside tabs */}
        <Stack.Screen name="chats/[chatId]" />
        <Stack.Screen name="otherProfile.tsx" />
        <Stack.Screen name="notifications" />

        {/* Create screens */}
         <Stack.Screen name="create/select-media" />
        <Stack.Screen name="create/edit-post" />
        <Stack.Screen name="create/compose.tsx" />

      </Stack>
      </NotificationProvider>
    </GestureHandlerRootView>
  );
}
