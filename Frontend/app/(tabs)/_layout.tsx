import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Tabs, useRouter } from "expo-router";
import React from "react";
import { Image, TouchableOpacity } from "react-native";

export default function TabLayout() {
  const router = useRouter();
  const [profilePic, setProfilePic] = React.useState<string>("");

  React.useEffect(() => {
    (async () => {
      try {
        const userData = await AsyncStorage.getItem("user");
        if (userData) {
          const parsed = JSON.parse(userData);
          setProfilePic(parsed?.profilePic || "");
        }
      } catch {}
    })();
  }, []);


  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false, // 🚫 hide labels like Instagram
        tabBarStyle: {
          backgroundColor: "#fff",
          borderTopWidth: 0,
          elevation: 4,
          height: 60,
        },
        tabBarActiveTintColor: "#000", // black when active
        tabBarInactiveTintColor: "#888", // gray when inactive
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add" size={28} color={color} />
          ),
          tabBarButton: (props) => (
            <TouchableOpacity
              {...props}
              onPress={() => router.push("/create/select-media")}
            />
          ),
        }}
      />

      {/* Chats tab must match the folder `(tabs)/chats` */}
      <Tabs.Screen
        name="chats"
        options={{
          tabBarIcon: ({ color }) => (
            <Ionicons name="chatbubble-ellipses-outline" size={28} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color, focused }) => (
            profilePic ? (
              <Image
                source={{ uri: profilePic }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  borderWidth: 2,
                  borderColor: focused ? "#000" : "transparent",
                }}
              />
            ) : (
              <Ionicons name="person-circle-outline" size={28} color={color} />
            )
          ),
        }}
      />
    </Tabs>
  );
}
