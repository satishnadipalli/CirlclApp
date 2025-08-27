// app/login.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "@/services/api.service";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity
} from "react-native";
import socketService from "@/services/socket.service";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Local network backend API is handled by api service

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter email and password");
      return;
    }

    setLoading(true);
    console.log("hello")
    try {
      const data: any = await (api as any).login(email, password)
      setLoading(false);

      if (!data?.token) {
        Alert.alert("Login Failed", data.message || "Something went wrong");
        return;
      }

      console.log("Login Success:", data);

      // Store token and user info locally
      await AsyncStorage.setItem("token", data.token);
      if (data?.refreshToken) await AsyncStorage.setItem("refreshToken", data.refreshToken);
      await AsyncStorage.setItem("user", JSON.stringify(data.user));

      // Ensure socket is connected and user is registered for in-app notifications
      try {
        await socketService.connect();
        if (data?.user?.id) socketService.registerUser(data.user.id);
      } catch {}

      // Redirect to home screen
      router.push("/");
    } catch (err) {
      setLoading(false);
      console.error(err);
      Alert.alert("Error", "Failed to login. Check your server.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Image source={{ uri: "https://via.placeholder.com/100" }} style={styles.logo} />
      <Text style={styles.title}>Welcome Back 👋</Text>
      <Text style={styles.subtitle}>Login to continue</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#999"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#999"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity
        style={[styles.button, loading && { opacity: 0.6 }]}
        onPress={handleLogin}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Logging in..." : "Login"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("/signup")}>
        <Text style={styles.signupText}>
          Don&apos;t have an account? <Text style={styles.signupLink}>Sign Up</Text>
        </Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingHorizontal: 25, justifyContent: "center", alignItems: "center" },
  logo: { width: 100, height: 100, marginBottom: 20, borderRadius: 50 },
  title: { fontSize: 28, fontWeight: "bold", color: "#222" },
  subtitle: { fontSize: 16, color: "#555", marginBottom: 30 },
  input: { width: "100%", height: 50, borderWidth: 1, borderColor: "#ddd", borderRadius: 12, paddingHorizontal: 15, fontSize: 16, marginBottom: 15, backgroundColor: "#f9f9f9" },
  button: { width: "100%", height: 50, backgroundColor: "#007AFF", borderRadius: 12, justifyContent: "center", alignItems: "center", marginTop: 10 },
  buttonText: { fontSize: 18, color: "#fff", fontWeight: "bold" },
  signupText: { marginTop: 20, fontSize: 14, color: "#555" },
  signupLink: { color: "#007AFF", fontWeight: "bold" },
});
