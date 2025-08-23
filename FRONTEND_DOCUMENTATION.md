# Frontend Documentation

## Project Structure
```
Frontend/
├── app/                    # Expo Router screens
│   ├── (tabs)/            # Main tab navigation
│   │   ├── index.tsx      # Home feed
│   │   ├── search.tsx     # Search & explore
│   │   ├── profile.tsx    # User profile
│   │   └── chats/         # Chat screens
│   ├── login.tsx          # Authentication
│   ├── signup.tsx         # User registration
│   └── _layout.tsx        # Root layout
├── components/            # Reusable components
├── services/              # API & Socket services
├── contexts/              # React contexts
├── hooks/                 # Custom hooks
├── constants/             # App constants
└── assets/                # Images & static files
```

## Key Components

### Navigation Structure
- **Tab Navigation**: Home, Search, Add, Chats, Profile
- **Stack Navigation**: Authentication, Chat details, User profiles
- **Modal Navigation**: Post creation, Comments, Settings

### State Management
- **Context API**: Notification context for global state
- **AsyncStorage**: Local data persistence
- **Socket Service**: Real-time state updates

## Screen Documentation

### Home Screen (`app/(tabs)/index.tsx`)
- **Purpose**: Main feed with posts and daily circle
- **Features**: 
  - Post feed with infinite scroll
  - Daily circle banner with countdown
  - Real-time notifications
  - Pull-to-refresh functionality

### Search Screen (`app/(tabs)/search.tsx`)
- **Purpose**: Content discovery and user search
- **Features**:
  - Explore feed with location-based content
  - User search with pagination
  - Daily circle feed
  - Quick post composer

### Profile Screen (`app/(tabs)/profile.tsx`)
- **Purpose**: User profile management
- **Features**:
  - Profile information display
  - Post grid with tabs (posts, saved, tagged)
  - Followers/following lists
  - Settings and logout

### Chat Screens
- **Chat List**: Recent conversations with unread counts
- **Chat Detail**: Message history with real-time updates
- **Group Management**: Member management and settings

## Services

### API Service (`services/api.service.ts`)
```typescript
class ApiService {
  constructor() {
    this.baseURL = require("../constants/Config").API_BASE_URL;
    this.token = null;
  }

  async request(endpoint, options = {}) {
    // Implementation for API requests
  }

  // Chat Methods
  async getChats() {
    return this.request("/messages/chats");
  }

  // User Methods
  async searchUsers(query, page = 1, limit = 10) {
    return this.request(`/users/search?q=${query}&page=${page}&limit=${limit}`);
  }

  // Post Methods
  async createPost(formData) {
    return this.request("/posts", {
      method: "POST",
      body: formData,
      headers: { "Content-Type": "multipart/form-data" }
    });
  }
}
```

### Socket Service (`services/socket.service.ts`)
```typescript
class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
  }

  async connect() {
    const token = await AsyncStorage.getItem("token");
    this.socket = io(API_ORIGIN, {
      auth: { token },
      transports: ["websocket"]
    });
  }

  onMessage(callback) {
    this.socket.on("receiveDirectMessage", callback);
    this.socket.on("receiveGroupMessage", callback);
  }

  sendMessage(messageData) {
    this.socket.emit("sendMessage", messageData);
  }
}
```

## Contexts

### Notification Context (`contexts/NotificationContext.tsx`)
```typescript
interface NotificationContextType {
  unreadCount: number;
  showNotification: (notification: NotificationData) => void;
  socket: Socket | null;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC = ({ children }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Implementation for notification management
};
```

## Hooks

### Custom Hooks
```typescript
// useColorScheme.ts
export function useColorScheme(): NonNullable<TextProps['style']>['color'] {
  return 'dark';
}

// useThemeColor.ts
export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  const theme = useColorScheme() ?? 'light';
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}
```

## Components

### Reusable Components

#### CommentModal (`components/CommentModal.tsx`)
- **Purpose**: Display and manage post comments
- **Features**: Comment list, reply functionality, like comments

#### DailyRing (`components/DailyRing.tsx`)
- **Purpose**: Display daily circle participation rings
- **Features**: User avatars, streak indicators

#### Header (`components/Header.tsx`)
- **Purpose**: App header with navigation and actions
- **Features**: Logo, notification badge, profile picture

#### NotificationBadge (`components/NotificationBadge.tsx`)
- **Purpose**: Display unread notification count
- **Features**: Animated badge, click handling

## Styling

### Theme System
```typescript
// constants/Colors.ts
export const Colors = {
  light: {
    text: '#000',
    background: '#fff',
    tint: '#2f95dc',
    tabIconDefault: '#ccc',
    tabIconSelected: '#2f95dc',
  },
  dark: {
    text: '#fff',
    background: '#000',
    tint: '#fff',
    tabIconDefault: '#ccc',
    tabIconSelected: '#fff',
  },
};
```

### Common Styles
```typescript
// components/ThemedText.tsx
export function ThemedText(props: TextProps) {
  const { style, lightColor, darkColor, ...otherProps } = props;
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return <Text style={[{ color }, style]} {...otherProps} />;
}
```

## Performance Optimization

### Image Optimization
- Use Expo Image component for optimized loading
- Implement lazy loading for feed images
- Cache images with AsyncStorage

### List Optimization
- Use FlatList for large datasets
- Implement windowing for performance
- Use React.memo for expensive components

### Memory Management
- Clean up socket listeners on unmount
- Clear timers and intervals
- Optimize re-renders with useMemo and useCallback

## Error Handling

### API Error Handling
```typescript
async function handleApiError(error: any) {
  if (error.response?.status === 401) {
    // Handle unauthorized
    await AsyncStorage.removeItem('token');
    router.replace('/login');
  } else if (error.response?.status === 404) {
    // Handle not found
    showToast('Resource not found');
  } else {
    // Handle general errors
    showToast('Something went wrong');
  }
}
```

### Network Error Handling
```typescript
const checkNetworkStatus = () => {
  NetInfo.addEventListener(state => {
    if (!state.isConnected) {
      showToast('No internet connection');
    }
  });
};
```

## Testing

### Component Testing
```typescript
import { render, fireEvent } from '@testing-library/react-native';
import LoginScreen from '../app/login';

test('should handle login', () => {
  const { getByPlaceholderText, getByText } = render(<LoginScreen />);
  
  fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com');
  fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
  fireEvent.press(getByText('Login'));
  
  // Add assertions for expected behavior
});
```

### Integration Testing
```typescript
import { render, waitFor } from '@testing-library/react-native';
import HomeScreen from '../app/(tabs)/index';

test('should load posts on mount', async () => {
  const { getByTestId } = render(<HomeScreen />);
  
  await waitFor(() => {
    expect(getByTestId('post-list')).toBeTruthy();
  });
});
```

## Real-time Features

### Socket Connection Management
```typescript
// Socket connection with reconnection logic
class SocketManager {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  async connect() {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      this.socket = io(API_ORIGIN, {
        auth: { token },
        transports: ['websocket'],
        timeout: 20000,
      });

      this.setupEventListeners();
      this.setupReconnection();
    } catch (error) {
      console.error('Socket connection failed:', error);
    }
  }

  private setupReconnection() {
    this.socket?.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') {
        this.handleReconnection();
      }
    });
  }

  private handleReconnection() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        this.reconnectAttempts++;
        this.connect();
      }, 1000 * this.reconnectAttempts);
    }
  }
}
```

### Real-time State Updates
```typescript
// Real-time message handling
const useRealTimeMessages = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  useEffect(() => {
    socketService.onMessage((message) => {
      setMessages(prev => [...prev, message]);
    });

    socketService.onTyping(({ from }) => {
      setTypingUsers(prev => [...prev, from]);
    });

    socketService.onStopTyping(({ from }) => {
      setTypingUsers(prev => prev.filter(user => user !== from));
    });

    return () => {
      socketService.removeMessageListener();
      socketService.removeTypingListener();
    };
  }, []);

  return { messages, typingUsers };
};
```

## Navigation

### Expo Router Configuration
```typescript
// app/_layout.tsx
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NotificationProvider>
        <Stack screenOptions={{ headerShown: false }}>
          {/* Authentication screens */}
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />

          {/* Main app tabs */}
          <Stack.Screen name="(tabs)" />

          {/* Modal screens */}
          <Stack.Screen name="chats/[chatId]" />
          <Stack.Screen name="otherProfile" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="highlights" />

          {/* Create screens */}
          <Stack.Screen name="create/select-media" />
          <Stack.Screen name="create/edit-post" />
          <Stack.Screen name="create/compose-post" />
        </Stack>
      </NotificationProvider>
    </GestureHandlerRootView>
  );
}
```

### Tab Navigation
```typescript
// app/(tabs)/_layout.tsx
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: "#fff",
          borderTopWidth: 0,
          elevation: 4,
          height: 60,
        },
        tabBarActiveTintColor: "#000",
        tabBarInactiveTintColor: "#888",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color }) => (
            <Ionicons name="home-outline" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          tabBarIcon: ({ color }) => (
            <Ionicons name="search-outline" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          tabBarIcon: ({ color }) => (
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
      <Tabs.Screen
        name="chats/index"
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
```

## Authentication Flow

### Login Screen Implementation
```typescript
// app/login.tsx
export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter email and password");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      setLoading(false);

      if (!response.ok) {
        Alert.alert("Login Failed", data.message || "Something went wrong");
        return;
      }

      // Store token and user info
      await AsyncStorage.setItem("token", data.token);
      await AsyncStorage.setItem("user", JSON.stringify(data.user));

      // Redirect to home
      router.push("/");
    } catch (err) {
      setLoading(false);
      console.error(err);
      Alert.alert("Error", "Failed to login. Check your server.");
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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
    </KeyboardAvoidingView>
  );
}
```

## Media Handling

### Image Picker Implementation
```typescript
// Media selection for posts
const selectMedia = async () => {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setSelectedMedia(result.assets[0]);
    }
  } catch (error) {
    console.error('Error picking image:', error);
    Alert.alert('Error', 'Failed to select image');
  }
};

// Camera capture
const takePhoto = async () => {
  try {
    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setSelectedMedia(result.assets[0]);
    }
  } catch (error) {
    console.error('Error taking photo:', error);
    Alert.alert('Error', 'Failed to take photo');
  }
};
```

### Media Upload
```typescript
// Upload media to server
const uploadMedia = async (mediaUri: string) => {
  try {
    const formData = new FormData();
    formData.append('file', {
      uri: mediaUri,
      type: 'image/jpeg',
      name: 'upload.jpg',
    } as any);

    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
      body: formData,
    });

    const data = await response.json();
    return data.url;
  } catch (error) {
    console.error('Upload failed:', error);
    throw new Error('Failed to upload media');
  }
};
```

## Push Notifications

### Notification Setup
```typescript
// app/_layout.tsx
useEffect(() => {
  async function registerPush() {
    try {
      const perms = await Notifications.getPermissionsAsync();
      let granted = perms?.granted;
      
      if (!granted) {
        const req = await Notifications.requestPermissionsAsync();
        granted = req?.granted;
      }
      
      if (!granted) return;
      
      const token = (await Notifications.getExpoPushTokenAsync()).data;
      if (token) {
        await api.registerPushToken(token);
      }
    } catch (error) {
      console.error('Push notification setup failed:', error);
    }
  }

  registerPush();
}, []);
```

### Notification Handling
```typescript
// Handle incoming notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Listen for notifications
useEffect(() => {
  const subscription = Notifications.addNotificationReceivedListener(notification => {
    console.log('Notification received:', notification);
    // Update unread count or show in-app notification
  });

  const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
    console.log('Notification response:', response);
    // Handle notification tap
    const data = response.notification.request.content.data;
    if (data?.type === 'message') {
      router.push(`/chats/${data.chatId}`);
    }
  });

  return () => {
    subscription.remove();
    responseSubscription.remove();
  };
}, []);
```

## Location Services

### Location Permission and Capture
```typescript
// app/_layout.tsx
useEffect(() => {
  async function captureLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      
      const loc = await Location.getCurrentPositionAsync({ 
        accuracy: Location.Accuracy.Balanced 
      });
      
      const coords = { 
        lat: loc.coords.latitude, 
        lng: loc.coords.longitude 
      };
      
      await AsyncStorage.setItem("user_coords", JSON.stringify(coords));
    } catch (error) {
      console.error('Location capture failed:', error);
    }
  }

  captureLocation();
}, []);
```

### Location-based Content
```typescript
// Use location for explore feed
const loadExploreWithLocation = async () => {
  try {
    const coordsRaw = await AsyncStorage.getItem("user_coords");
    let queryParams = `page=${page}&limit=${limit}`;
    
    if (coordsRaw) {
      const coords = JSON.parse(coordsRaw);
      queryParams += `&lat=${coords.lat}&lng=${coords.lng}`;
    }
    
    const response = await api.getExplore(queryParams);
    setExplorePosts(response.posts);
  } catch (error) {
    console.error('Failed to load explore:', error);
  }
};
```

## Performance Monitoring

### Performance Tracking
```typescript
// Track app performance
const trackPerformance = () => {
  const startTime = Date.now();
  
  return {
    end: (action: string) => {
      const duration = Date.now() - startTime;
      console.log(`${action} took ${duration}ms`);
      
      // Send to analytics if needed
      if (duration > 1000) {
        console.warn(`Slow operation: ${action} (${duration}ms)`);
      }
    }
  };
};

// Usage in components
const loadPosts = async () => {
  const perf = trackPerformance();
  try {
    const posts = await api.getPosts();
    setPosts(posts);
  } finally {
    perf.end('loadPosts');
  }
};
```

### Memory Leak Prevention
```typescript
// Cleanup on unmount
useEffect(() => {
  let isMounted = true;
  
  const loadData = async () => {
    try {
      const data = await api.getData();
      if (isMounted) {
        setData(data);
      }
    } catch (error) {
      if (isMounted) {
        setError(error);
      }
    }
  };
  
  loadData();
  
  return () => {
    isMounted = false;
  };
}, []);
```

## Accessibility

### Accessibility Implementation
```typescript
// Accessible components
const AccessibleButton = ({ onPress, title, accessibilityLabel, ...props }) => (
  <TouchableOpacity
    onPress={onPress}
    accessible={true}
    accessibilityLabel={accessibilityLabel || title}
    accessibilityRole="button"
    accessibilityHint="Double tap to activate"
    {...props}
  >
    <Text>{title}</Text>
  </TouchableOpacity>
);

// Screen reader support
const ScreenReaderText = ({ children, ...props }) => (
  <Text
    accessible={true}
    accessibilityRole="text"
    {...props}
  >
    {children}
  </Text>
);
```

### VoiceOver Support
```typescript
// VoiceOver announcements
import * as Haptics from 'expo-haptics';

const announceToScreenReader = (message: string) => {
  // On iOS, use AccessibilityInfo
  if (Platform.OS === 'ios') {
    AccessibilityInfo.announceForAccessibility(message);
  }
  
  // Provide haptic feedback
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

// Usage
const handleLike = () => {
  // Like logic
  announceToScreenReader('Post liked');
};
```

This comprehensive frontend documentation covers all aspects of the React Native application, from basic setup to advanced features like real-time communication, performance optimization, and accessibility.