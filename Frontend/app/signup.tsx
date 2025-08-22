import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity } from "react-native";

export default function SignupScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!name || !email || !password) {
      Alert.alert("Error", "Please fill all fields");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(require("../constants/Config").API_BASE_URL + "/users/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Signup failed");
      await AsyncStorage.setItem("token", data.token);
      await AsyncStorage.setItem("user", JSON.stringify(data.user));
      router.replace("/(tabs)");
    } catch (e) {
      Alert.alert("Signup failed", (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Image source={{ uri: "https://via.placeholder.com/100" }} style={styles.logo} />
      <Text style={styles.title}>Create Account 🚀</Text>
      <Text style={styles.subtitle}>Sign up to get started</Text>

      <TextInput style={styles.input} placeholder="Full Name" placeholderTextColor="#999" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#999" value={email} onChangeText={setEmail} keyboardType="email-address" />
      <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#999" value={password} onChangeText={setPassword} secureTextEntry />

      <TouchableOpacity style={[styles.button, loading && { opacity: 0.6 }]} onPress={handleSignup} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Signing up..." : "Sign Up"}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("/login")}>
        <Text style={styles.signupText}>Already have an account? <Text style={styles.signupLink}>Login</Text></Text>
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
