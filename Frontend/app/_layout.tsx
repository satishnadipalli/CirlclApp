import { NotificationProvider } from "@/contexts/NotificationContext";
import socketService from "@/services/socket.service";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack } from "expo-router";
import React, { useEffect } from "react";
import * as Location from "expo-location";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Notifications from "expo-notifications";
import api from "@/services/api.service";

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

  async function captureLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      await AsyncStorage.setItem("user_coords", JSON.stringify(coords));
    } catch {}
  }

  captureLocation();

  async function registerPush() {
    try {
      const perms = await Notifications.getPermissionsAsync()
      let granted = perms?.granted
      if (!granted) {
        const req = await Notifications.requestPermissionsAsync()
        granted = req?.granted
      }
      if (!granted) return
      const token = (await Notifications.getExpoPushTokenAsync()).data
      if (token) await api.registerPushToken(token)
    } catch {}
  }

  registerPush();

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
        <Stack.Screen name="highlights" />
        <Stack.Screen name="settings/notifications" />

        {/* Create screens */}
         <Stack.Screen name="create/select-media" />
        <Stack.Screen name="create/edit-post" />
        <Stack.Screen name="create/compose-post" />

      </Stack>
      </NotificationProvider>
    </GestureHandlerRootView>
  );
}
