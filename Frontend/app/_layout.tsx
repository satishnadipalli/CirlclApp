import { NotificationProvider } from "@/contexts/NotificationContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import socketService from "@/services/socket.service";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack } from "expo-router";
import React, { useEffect } from "react";
import * as Location from "expo-location";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Notifications from "expo-notifications";
import api from "@/services/api.service";
import { useFonts, Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from "@expo-google-fonts/manrope";
import { Text, TextInput } from "react-native";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  })

  useEffect(() => {
    if (!fontsLoaded) return
    try {
      // Set global default font family for Text and TextInput
      ;(Text as any).defaultProps = (Text as any).defaultProps || {}
      const prevText = (Text as any).defaultProps.style
      ;(Text as any).defaultProps.style = [{ fontFamily: "Manrope_400Regular" }, prevText].filter(Boolean)
      ;(TextInput as any).defaultProps = (TextInput as any).defaultProps || {}
      const prevInput = (TextInput as any).defaultProps.style
      ;(TextInput as any).defaultProps.style = [{ fontFamily: "Manrope_400Regular" }, prevInput].filter(Boolean)
      // Bold mappings convenience
      const origRender = (Text as any).render
      ;(Text as any).render = function(...args: any[]) {
        const element = origRender.call(this, ...args)
        try {
          const props = element?.props || {}
          const style = Array.isArray(props.style) ? props.style.flat() : [props.style].filter(Boolean)
          const weight = style.find((s: any) => s?.fontWeight)?.fontWeight
          if (weight === '700' || weight === 'bold') {
            return React.cloneElement(element, { style: [{ fontFamily: 'Manrope_700Bold' }, ...style.filter(Boolean)] })
          }
          if (weight === '800') {
            return React.cloneElement(element, { style: [{ fontFamily: 'Manrope_800ExtraBold' }, ...style.filter(Boolean)] })
          }
          if (weight === '600') {
            return React.cloneElement(element, { style: [{ fontFamily: 'Manrope_600SemiBold' }, ...style.filter(Boolean)] })
          }
          return React.cloneElement(element, { style: [{ fontFamily: 'Manrope_400Regular' }, ...style.filter(Boolean)] })
        } catch { return element }
      }
    } catch {}
  }, [fontsLoaded])

  useEffect(() => {
  async function initSocket() {
    const userData = await AsyncStorage.getItem("user");
    const token = await AsyncStorage.getItem('token')
    if (!userData || !token) return;

    const parsedUser = JSON.parse(userData);
    try { socketService.updateAuthToken(token) } catch {}
    await socketService.connect();
    try {
      const res: any = await (await import('@/services/api.service')).apiService.getPrivacy()
      if (res?.success && res?.privacy) {
        socketService.setClientPrivacy({ sendTypingIndicators: res.privacy.sendTypingIndicators !== false })
      }
    } catch {}
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
      // Gentle daily reminder respecting prefs
      try {
        const prefs: any = await api.getNotificationPrefs()
        const dailyOn = !!(prefs as any)?.prefs?.daily
        if (dailyOn) {
          // cancel previous
          try { await Notifications.cancelScheduledNotificationAsync('daily-circle-reminder' as any) } catch {}
          // schedule at 7pm local
          const trigger = { hour: 19, minute: 0, repeats: true } as any
          await Notifications.scheduleNotificationAsync({
            identifier: 'daily-circle-reminder' as any,
            content: { title: 'Daily Circle', body: "Share today's moment with your circle ✨", sound: 'default' },
            trigger,
          })
        }
      } catch {}
    } catch {}
  }

  registerPush();

  return () => {
    socketService.disconnect();
  };
}, []);



  if (!fontsLoaded) return null

  return (

    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
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
        <Stack.Screen name="settings/theme" />

        {/* Create screens */}
         <Stack.Screen name="create/select-media" />
        <Stack.Screen name="create/edit-post" />
        <Stack.Screen name="create/compose-post" />

        {/* Swarm session screen */}
        <Stack.Screen name="swarms/[swarmId]" />
        <Stack.Screen name="swarms/outcomes/[groupId]" />

      </Stack>
      </NotificationProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
