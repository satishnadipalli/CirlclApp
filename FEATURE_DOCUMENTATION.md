## Swarm Sessions (AI‑facilitated micro‑brainstorms)

MVP implementation details:

- Backend:
  - Model: `Backend/models/swarmSession.model.js` (ideas, clusters, votes, actions, phases)
  - Routes: `POST /api/swarms` create; `GET /api/swarms/:swarmId` get; `POST /:id/join`, `/start`, `/phase`, `/ideas`, `/clusters`, `/ideas/:ideaId/vote`, `/actions`, `/end`.
  - Group lists: `GET /api/swarms/group/:groupId`, `/group/:groupId/outcomes`.
  - Summary: On `/end`, posts a summary group message.

- Realtime:
  - Socket rooms: `joinSwarm`/`leaveSwarm` join `swarm_<id>`
  - Events: `swarm:phase`, `swarm:idea`, `swarm:votes`, `swarm:clusters`, `swarm:actions`, `swarm:ended`.

- Frontend (Expo Router):
  - Start from group: `app/groups/[groupId].tsx` → “Start Swarm” modal, “Outcomes” link.
  - Live session: `app/swarms/[swarmId].tsx` with phases, idea input (diverge only), clustering (host), voting (vote phase), converge actions (host), countdown.
  - Outcomes list: `app/swarms/outcomes/[groupId].tsx`.

### How to test
1) Create a group or open existing.
2) Tap “Start Swarm”, keep default prompt, start.
3) Live screen: in Diverge, submit a few ideas from multiple devices/users.
4) Switch to Cluster (host), select ideas → add clusters.
5) Switch to Vote (host), vote on ideas (one per idea per user).
6) Switch to Converge (host), add actions and then End.
7) Check group chat for summary message; check “Outcomes” list.

Permissions & notes:
- Only group creator/admin (host) can start, change phase, cluster, set actions, and end.
- Ideas accepted only during Diverge; votes accepted only during Vote.
- Countdown reflects session end; host can end early.
# Feature Documentation

## Overview

This document provides detailed explanations of how each feature works in the social media application, including user flows, technical implementation, and business logic.

## 1. User Authentication & Profile Management

### 1.1 User Registration
**How it works:**
1. User enters name, email, and password
2. System validates input (email format, password strength)
3. Checks if email already exists in database
4. Hashes password using bcrypt with salt rounds of 10
5. Creates new user record in MongoDB
6. Generates JWT token with 7-day expiration
7. Returns token and user data to client

**User Flow:**
```
User Input → Validation → Email Check → Password Hash → User Creation → JWT Generation → Success Response
```

**Technical Implementation:**
```javascript
// Password hashing
const hashedPassword = await bcrypt.hash(password, 10);

// JWT token generation
const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
  expiresIn: "7d",
});
```

### 1.2 User Login
**How it works:**
1. User provides email and password
2. System finds user by email in database
3. Compares provided password with hashed password using bcrypt
4. If match found, generates new JWT token
5. Returns token and user profile data

**User Flow:**
```
Email/Password → User Lookup → Password Verification → JWT Generation → Profile Data Return
```

**Security Features:**
- Password never stored in plain text
- JWT tokens expire after 7 days
- Failed login attempts don't reveal if email exists

### 1.3 Profile Management
**How it works:**
- Users can view their profile with posts, followers, and following counts
- Profile includes bio, website, and profile picture
- Users can edit their profile information
- Profile displays saved posts and highlights

**Profile Data Structure:**
```javascript
{
  _id: "user_id",
  name: "John Doe",
  email: "john@example.com",
  profilePic: "https://cloudinary.com/image.jpg",
  bio: "User bio",
  website: "https://example.com",
  followers: ["follower_id_1", "follower_id_2"],
  following: ["following_id_1", "following_id_2"],
  savedPosts: ["post_id_1", "post_id_2"],
  closeFriends: ["friend_id_1", "friend_id_2"],
  blockedUsers: ["blocked_id_1"]
}
```

## 2. Social Features

### 2.1 Follow/Unfollow System
**How it works:**
1. User clicks follow button on another user's profile
2. System adds target user to current user's following list
3. System adds current user to target user's followers list
4. Real-time notification sent to target user via Socket.IO
5. Follow count updates immediately

**Database Operations:**
```javascript
// Add to following
currentUser.following.push(userToFollow._id);
// Add to followers
userToFollow.followers.push(currentUser._id);
```

**Real-time Updates:**
```javascript
// Emit socket event to followed user
io.to(socketId).emit("newFollower", {
  followerId: currentUser._id,
  followerName: currentUser.name,
  followedId: userToFollow._id.toString(),
});
```

### 2.2 Close Friends Feature
**How it works:**
- Users can designate specific followers as "close friends"
- Close friends get access to exclusive content
- Daily Circle entries can be shared only with close friends
- Users can add/remove close friends from their list

**Implementation:**
```javascript
// Add close friend
user.closeFriends.push(friendId);
// Remove close friend
user.closeFriends = user.closeFriends.filter(id => id !== friendId);
```

### 2.3 User Blocking
**How it works:**
1. User blocks another user from profile or chat
2. Blocked user cannot see blocker's posts or send messages
3. Blocker cannot see blocked user's content
4. Mutual blocking prevents all interactions

**Block Logic:**
```javascript
// Check if user is blocked
const isBlocked = user.blockedUsers.includes(targetUserId) || 
                  targetUser.blockedUsers.includes(userId);
```

## 3. Post Creation & Management

### 3.1 Post Creation Process
**How it works:**
1. User selects media (photo/video) from gallery or camera
2. User adds title and description
3. System extracts hashtags (#tag) and mentions (@username) from description
4. Media uploaded to Cloudinary with optimization
5. Post saved to database with location data (if provided)
6. Notifications sent to mentioned users
7. Post appears in user's profile and followers' feeds

**Hashtag & Mention Extraction:**
```javascript
const hashtags = (description.match(/#\w+/g) || []).map(t => 
  t.substring(1).toLowerCase()
);
const mentions = (description.match(/@\w+/g) || []).map(u => 
  u.substring(1)
);
```

**Location Tagging:**
```javascript
if (lat && lng) {
  post.geo = { 
    type: "Point", 
    coordinates: [lng, lat] 
  };
}
```

### 3.2 Post Feed Algorithm
**How it works:**
1. System fetches posts from users the current user follows
2. Posts sorted by creation date (newest first)
3. Pagination implemented for performance
4. Posts include user data, like counts, and comment previews

**Feed Query:**
```javascript
const posts = await Post.find({ user: { $in: followingIds } })
  .sort({ createdAt: -1 })
  .skip((page - 1) * limit)
  .limit(limit)
  .populate("user", "name profilePic");
```

### 3.3 Explore Feed
**How it works:**
1. Algorithm considers multiple factors:
   - User's location (proximity-based content)
   - Popular posts (high engagement)
   - Content from users with similar interests
   - Trending hashtags
2. Content personalized based on user behavior
3. Location-based discovery for nearby content

**Scoring Algorithm:**
```javascript
const score = (post) => {
  let score = 0;
  // Recency bonus
  score += (Date.now() - post.createdAt) / (1000 * 60 * 60 * 24);
  // Engagement bonus
  score += post.likes.length * 2 + post.comments.length * 3;
  // Location proximity bonus
  if (userLocation && post.geo) {
    const distance = calculateDistance(userLocation, post.geo);
    score += Math.max(0, 10 - distance);
  }
  return score;
};
```

## 4. Engagement Features

### 4.1 Like System
**How it works:**
1. User taps like button on post
2. System adds user ID to post's likes array
3. Like count updates immediately
4. Notification sent to post author via Socket.IO
5. Like button changes to "liked" state

**Like Implementation:**
```javascript
// Toggle like
if (post.likes.includes(userId)) {
  post.likes = post.likes.filter(id => id !== userId);
} else {
  post.likes.push(userId);
  // Send notification
  await createNotification({
    receiverId: post.user,
    senderId: userId,
    type: "like",
    postId: post._id
  });
}
```

### 4.2 Comment System
**How it works:**
1. User adds comment to post
2. System extracts hashtags and mentions from comment
3. Comment saved with user reference and timestamp
4. Notification sent to post author
5. Additional notifications sent to mentioned users

**Comment Structure:**
```javascript
{
  _id: "comment_id",
  user: "user_id",
  text: "Great post! #awesome @john",
  likes: [],
  replies: [],
  hashtags: ["awesome"],
  mentions: ["john"],
  createdAt: "2024-01-01T00:00:00.000Z"
}
```

### 4.3 Reply System
**How it works:**
1. User replies to existing comment
2. Reply nested under parent comment
3. Reply can also contain hashtags and mentions
4. Notifications sent to comment author and mentioned users

**Reply Implementation:**
```javascript
const reply = {
  user: userId,
  text: replyText,
  likes: [],
  createdAt: new Date()
};
comment.replies.push(reply);
```

### 4.4 Save Posts
**How it works:**
1. User taps save button on post
2. Post ID added to user's savedPosts array
3. Post accessible from user's profile under "Saved" tab
4. Save button changes to "saved" state

## 5. Daily Circle Feature

### 5.1 Daily Prompt System
**How it works:**
1. System generates daily prompt at midnight UTC
2. Prompt displayed to all users
3. Users can only post one entry per day
4. Prompt expires after 24 hours
5. New prompt generated for next day

**Prompt Generation:**
```javascript
const prompts = [
  "Share a moment from your day",
  "What made you smile today?",
  "Show us your workspace",
  "What are you grateful for today?"
];
const todayPrompt = prompts[Math.floor(Math.random() * prompts.length)];
```

### 5.2 Social Lock Mechanism
**How it works:**
1. Users must post their daily entry before viewing others' entries
2. Creates social pressure to participate
3. Users can see who has posted (rings) but not content until they post
4. Encourages daily engagement and content creation

**Lock Logic:**
```javascript
const userHasPosted = await DailyCircleEntry.findOne({
  user: userId,
  dateKey: today
});

if (!userHasPosted) {
  return { locked: true, message: "Post your daily entry first" };
}
```

### 5.3 Streak Tracking
**How it works:**
1. System tracks consecutive days of posting
2. Streak increments each day user posts
3. Streak resets to 0 if user misses a day
4. Milestone achievements celebrated (7, 30, 100 days)
5. Longest streak recorded separately

**Streak Calculation:**
```javascript
const updateStreak = async (userId) => {
  const user = await User.findById(userId);
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  const yesterdayEntry = await DailyCircleEntry.findOne({
    user: userId,
    dateKey: yesterday
  });
  
  if (yesterdayEntry) {
    user.streak.currentStreak += 1;
  } else {
    user.streak.currentStreak = 1;
  }
  
  if (user.streak.currentStreak > user.streak.longestStreak) {
    user.streak.longestStreak = user.streak.currentStreak;
  }
};
```

### 5.4 Daily Rings
**How it works:**
1. Shows followers who have posted today
2. Displays as circular avatars (like Instagram stories)
3. Users can tap to view specific entries
4. Creates visual social pressure to participate
5. Updates in real-time as people post

**Rings Implementation:**
```javascript
const rings = await DailyCircleEntry.find({
  user: { $in: user.followers },
  dateKey: today
}).populate("user", "name profilePic");
```

### 5.5 Ephemeral Content
**How it works:**
1. Daily entries automatically expire after 24 hours
2. MongoDB TTL index handles automatic deletion
3. Content becomes inaccessible after expiration
4. Creates urgency and FOMO (Fear of Missing Out)
5. Encourages daily checking and engagement

**TTL Index:**
```javascript
dailyCircleEntrySchema.index(
  { createdAt: 1 }, 
  { expireAfterSeconds: 60 * 60 * 24 }
);
```

## 6. Messaging System

### 6.1 Direct Messaging
**How it works:**
1. User selects recipient from chat list or user profile
2. Messages sent in real-time via Socket.IO
3. Messages stored in database for persistence
4. Read receipts track message status
5. Typing indicators show when user is composing

**Message Flow:**
```
User Types → Typing Indicator → Send Message → Database Save → Socket Emit → Recipient Receives
```

**Real-time Implementation:**
```javascript
// Send message
socket.emit('sendMessage', { to: recipientId, text: messageText });

// Receive message
socket.on('receiveDirectMessage', (message) => {
  // Update chat UI
  updateChatMessages(message);
});
```

### 6.2 Group Chat
**How it works:**
1. Users can create groups with multiple members
2. Group admins can add/remove members
3. Messages sent to all group members
4. Read receipts show who has read messages
5. Group typing indicators for all members

**Group Management:**
```javascript
// Create group
const group = new Group({
  name: groupName,
  description: groupDescription,
  creator: userId,
  members: memberIds,
  admins: [userId]
});
```

### 6.3 Message Features
**Read Receipts:**
- Messages marked as read when recipient opens chat
- Read status synced across devices
- Group messages show who has read

**Typing Indicators:**
- Real-time typing status via Socket.IO
- Shows when user is composing message
- Automatically clears after 3 seconds of inactivity

**Message Persistence:**
- All messages stored in MongoDB
- Pagination for large chat histories
- Messages accessible across devices

## 7. Notification System

### 7.1 Notification Types
**How it works:**
1. **Like Notifications**: When someone likes your post
2. **Comment Notifications**: When someone comments on your post
3. **Follow Notifications**: When someone follows you
4. **Mention Notifications**: When someone mentions you in post/comment
5. **Message Notifications**: When someone sends you a message

**Notification Creation:**
```javascript
const createNotification = async (data) => {
  const notification = await Notification.create({
    receiver: data.receiverId,
    sender: data.senderId,
    type: data.type,
    post: data.postId,
    text: data.text
  });
  
  // Real-time notification
  io.to(socketId).emit('newNotification', notification);
};
```

### 7.2 Push Notifications
**How it works:**
1. User grants notification permissions
2. Expo push token registered with backend
3. Notifications sent via Expo push service
4. Notifications appear on device even when app is closed
5. Deep linking opens relevant screen when tapped

**Push Token Registration:**
```javascript
// Frontend
const token = await Notifications.getExpoPushTokenAsync();
await api.registerPushToken(token.data);

// Backend
user.expoPushTokens.push(token);
```

### 7.3 In-App Notifications
**How it works:**
1. Real-time notifications via Socket.IO
2. Notification badge shows unread count
3. Notification center displays all notifications
4. Users can mark notifications as read
5. Notifications link to relevant content

## 8. Search & Discovery

### 8.1 User Search
**How it works:**
1. Search by username or display name
2. Results filtered by relevance and popularity
3. Pagination for large result sets
4. Search excludes blocked users
5. Results show profile picture and follower count

**Search Implementation:**
```javascript
const users = await User.find({
  $or: [
    { name: { $regex: query, $options: 'i' } },
    { username: { $regex: query, $options: 'i' } }
  ],
  _id: { $nin: blockedUsers }
}).limit(limit);
```

### 8.2 Hashtag Search
**How it works:**
1. Search posts by hashtag
2. Results sorted by recency and engagement
3. Shows post count for each hashtag
4. Trending hashtags highlighted
5. Users can follow hashtags for updates

### 8.3 Location-Based Discovery
**How it works:**
1. Uses device GPS for user location
2. Finds posts from nearby users
3. Distance-based relevance scoring
4. Privacy controls for location sharing
5. Location data stored as GeoJSON

**Geospatial Query:**
```javascript
const nearbyPosts = await Post.find({
  geo: {
    $near: {
      $geometry: {
        type: "Point",
        coordinates: [userLng, userLat]
      },
      $maxDistance: 50000 // 50km
    }
  }
});
```

## 9. Media Management

### 9.1 Photo/Video Upload
**How it works:**
1. User selects media from gallery or camera
2. Image/video optimized for mobile viewing
3. Uploaded to Cloudinary with transformation
4. Multiple formats generated (thumbnail, preview, full-size)
5. CDN delivery for fast loading

**Cloudinary Upload:**
```javascript
const result = await cloudinary.uploader.upload(file, {
  folder: "social_app",
  transformation: [
    { width: 1080, height: 1080, crop: "fill" },
    { quality: "auto", fetch_format: "auto" }
  ]
});
```

### 9.2 Media Optimization
**How it works:**
1. Automatic image compression
2. Responsive image sizes
3. Lazy loading for performance
4. Progressive image loading
5. Video thumbnail generation

### 9.3 Media Privacy
**How it works:**
1. Users control who can see their media
2. Private posts only visible to followers
3. Close friends get exclusive content access
4. Media can be deleted at any time
5. Backup copies maintained for recovery

## 10. Privacy & Safety Features

### 10.1 Content Visibility Controls
**How it works:**
1. **Public**: Visible to everyone
2. **Followers Only**: Visible to approved followers
3. **Close Friends**: Visible only to close friends
4. **Private**: Visible only to user

**Visibility Implementation:**
```javascript
const canViewContent = (content, viewer, owner) => {
  if (content.visibility === 'public') return true;
  if (viewer._id.equals(owner._id)) return true;
  if (content.visibility === 'followers' && owner.followers.includes(viewer._id)) return true;
  if (content.visibility === 'closeFriends' && owner.closeFriends.includes(viewer._id)) return true;
  return false;
};
```

### 10.2 User Blocking
**How it works:**
1. Blocked users cannot see blocker's content
2. Blocker cannot see blocked user's content
3. Messages between blocked users are prevented
4. Block list is private and not visible to others
5. Users can unblock at any time

### 10.3 Content Moderation
**How it works:**
1. Automated content filtering
2. User reporting system
3. Manual review process
4. Content removal capabilities
5. User suspension for violations

## 11. Performance Features

### 11.1 Infinite Scrolling
**How it works:**
1. Posts loaded in batches (pagination)
2. More content loaded as user scrolls
3. Virtual scrolling for large lists
4. Image lazy loading
5. Memory management for performance

### 11.2 Real-time Updates
**How it works:**
1. Socket.IO for instant updates
2. Optimistic UI updates
3. Conflict resolution for simultaneous edits
4. Offline support with sync
5. Battery-efficient background updates

### 11.3 Caching Strategy
**How it works:**
1. Redis caching for frequently accessed data
2. Browser caching for static assets
3. CDN caching for media files
4. Memory caching for user sessions
5. Database query optimization

## 12. Analytics & Insights

### 12.1 User Analytics
**How it works:**
1. Track user engagement metrics
2. Monitor post performance
3. Analyze user behavior patterns
4. Generate insights for content optimization
5. Privacy-compliant data collection

### 12.2 Content Performance
**How it works:**
1. View counts for posts
2. Engagement rates (likes, comments, shares)
3. Reach and impressions tracking
4. Best posting time analysis
5. Hashtag performance metrics

This comprehensive feature documentation explains how each component of the social media application works, from user interactions to technical implementations, providing a complete understanding of the system's functionality.