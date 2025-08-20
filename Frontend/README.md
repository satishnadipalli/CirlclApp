# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

<!-- 
High-level architecture
Backend: Node.js (Express), MongoDB/Mongoose, Socket.IO, Cloudinary, JWT auth. Single server (Backend/server.js) exposes REST APIs and a Socket.IO server, attaches io and an in-memory onlineUsers map to app for controller access.
Frontend (mobile): Expo/React Native + Expo Router. REST via a thin ApiService, realtime via SocketService (Socket.IO client). Global notification layer via NotificationProvider.
Backend overview
Core setup

Backend/server.js: Express app + CORS + JSON body parsing. Routes:
/api/users, /api/upload, /api/posts, /api/notifications, /api/messages, /api/groups
HTTP server is wrapped by Socket.IO Server. Socket middleware verifies handshake.auth.token (JWT) and populates socket.userId. Tracks onlineUsers: Map<userId, socketId> and socketToUser: Map<socketId, userId>. Exposes io and onlineUsers on app.
Socket events:
Client -> server: register, joinGroup, leaveGroup, typing, stopTyping, groupTyping, groupStopTyping (sendMessage/sendGroupMessage are intentionally no-op; emits happen after REST persistence).
Server -> client: userStatusChange, receiveDirectMessage, receiveGroupMessage, typing, stopTyping, groupTyping, groupStopTyping, newNotification, newFollower, unfollowed.
DB: Backend/config/db.js connects with MONGO_URI. Cloudinary config in Backend/config/cloudinary.js.
Schemas (Mongoose)

User (Backend/models/user.models.js): name, username, email, password, profilePic, savedPosts, followers, following, timestamps.
Post (Backend/models/post.model.js): user ref, title, description, mediaUrl, hashtags, mentions, likes, nested comments and replies with likes/mentions/hashtags, optional geo (2dsphere index), timestamps.
Notification (Backend/models/notification.model.js): receiver, sender, type in ["like","comment","reply","follow","mention","save"], optional post/comment/reply, text, isRead, actionLink, timestamps.
Message (Backend/models/message.model.js): from, to (for direct), group (for group), text, messageType in ["direct","group"], optional replyTo, isRead, readBy[], timestamps. Pre-save validation ensures either to or group (but not both).
Group (Backend/models/group.model.js): name, description, creator, admins[], members[], groupPic, isActive, timestamps. Pre-save ensures creator is admin and member.
Controllers and routes

Users (Backend/controllers/user.controller.js, Backend/routes/user.routes.js)
POST /api/users/register, /api/users/login
GET /api/users/me (auth), GET /api/users/:id
Follow: POST /api/users/:id/follow; Unfollow: POST /api/users/:id/unfollow
Search: GET /api/users/search?q=...&page&limit[&groupId=&exclude=] (excludes self and optional group members)
Followers/following: GET /api/users/:id/followers, /api/users/:id/following (paginated)
On follow/unfollow, emits newFollower/unfollowed to target if online via onlineUsers.
Uploads (Backend/middlewares/upload.middleware.js, Backend/controllers/upload.controllers.js, Backend/routes/upload.routes.js)
POST /api/upload with file (Cloudinary), then uploadToCloudinary sets req.fileUrl for downstream handlers (used by posts).
Posts (Backend/controllers/post.controllers.js, Backend/routes/post.routes.js)
POST /api/posts (multipart/form-data: file, title, description, etc.) -> saves to Cloudinary + persists
GET /api/posts (currently returns posts by ?userId=; filter params hashtag/mention are built but not used in the query here), GET /api/posts/me
GET /api/posts/explore with scoring heuristics (popularity, recency, following affinity, saved affinity, hashtags, geo proximity)
DELETE /api/posts/:id, PUT /api/posts/:id/like
Comments/replies CRUD and like/unlike operations; on like/comment/reply/mention/save uses createNotification
Notifications (Backend/controllers/notification.controllers.js, Backend/routes/notification.routes.js)
GET /api/notifications (paginated), GET /api/notifications/unread-count
PUT /api/notifications/:id/read, PUT /api/notifications/read-all, DELETE /api/notifications/:id
Messages (Backend/controllers/message.controllers.js, Backend/routes/message.routes.js)
GET /api/messages/chats (aggregates last message + unread counts for direct and group)
GET /api/messages/direct/:withUserId (paginated)
POST /api/messages to send (direct or group; validates membership); after saving, emits receiveDirectMessage or to room receiveGroupMessage
POST mark read: /api/messages/direct/:peerId/read, /api/messages/group/:groupId/read
Groups (Backend/controllers/group.controllers.js, Backend/routes/group.routes.js)
POST /api/groups create
GET /api/groups list user’s groups; GET /api/groups/:groupId details (membership check)
GET /api/groups/:groupId/messages (paginated)
POST /api/groups/:groupId/members add members (persists and emits a system “added ...” message to group room + tailored emits)
DELETE /api/groups/:groupId/members/:memberId remove, POST /api/groups/:groupId/admins/:memberId promote, DELETE /api/groups/:groupId/admins/:adminId demote
Utilities

Backend/utils/functions.js createNotification({ req, receiverId, senderId, type, postId, commentId, replyId, text, actionLink }): creates Notification doc and, if receiverId online, emits newNotification with human-readable text.
Frontend overview
Core config

Frontend/services/api.service.ts: baseURL http://192.168.53.127:5000/api, bearer token from AsyncStorage, wrappers for chat, groups, users, explore, messages, reads. Note: login/register here point to /auth/... (backend does not expose these); app’s login.tsx calls /api/users/login directly.
Frontend/services/socket.service.ts: Socket.IO client to http://192.168.53.127:5000 with auth: { token }. Registers listeners for direct/group messages, typing, stop typing, group typing/stop, userStatusChange, newNotification, newFollower/unfollowed. Exposes registerUser, joinGroup, leaveGroup, sendDirectMessage/sendGroupMessage (emit only), and listener registration/removal. Reconnect backoff.
Frontend/contexts/NotificationContext.tsx: connects socket, listens for newNotification, increments unread, displays in-app animated banner, fetches unread count via REST.
Navigation

Expo Router stack: app/_layout.tsx registers socket globally (calls socketService.connect() and registerUser(parsedUser.id) if logged in), captures geolocation for explore proximity.
Tabs: app/(tabs)/_layout.tsx defines Home, Search, Add (navigates to create), Chats (index), Profile.
Screens (key integrations)

Chats list app/(tabs)/chats/index.tsx:
Loads user/token, fetches /messages/chats, normalizes direct/group entries, shows unread counts.
Sets up socket listeners: onReceiveDirectMessage updates/reorders direct chats; onReceiveGroupMessage updates group chat; shows typing indicators via onTyping/onGroupTyping. Polls every 5s as fallback.
Chat detail app/chats/[chatId].tsx:
For direct: GET /messages/direct/:withUserId and mark read via /messages/direct/:peerId/read.
For group: GET /groups/:groupId/messages and /groups/:groupId then mark read via /messages/group/:groupId/read.
Uses socketService to handle incoming messages/typing, merges optimistic temp message with server-ack to avoid duplicates, shows date headers and “system” chips (detects “added …”).
Emits typing/stopTyping (direct or group). Joins/leaves group rooms.
Groups: app/groups/index.tsx (list), app/groups/create.tsx (create; suggests followers for members; user search), app/groups/[groupId].tsx (details; add/remove/promote/demote; follow toggles for members).
Notifications app/notifications.tsx: Fetch list/unread count, mark as read/all, delete, live updates via socket.
Profile
Self: app/(tabs)/profile.tsx fetches /users/me and /posts/me, shows followers/following counts and lists. Live follow/unfollow updates via socketService.
Other user: app/otherProfile.tsx fetches profile and posts by ?userId=. Live follow/unfollow via raw io(...) in this screen (not socketService).
Create post app/create/compose-post.tsx: FormData to POST /api/posts with file, title, description, mentions/hashtags (from caption), optional location lat/lng. Works with Cloudinary middleware.
End-to-end flows
Auth/login: POST /api/users/login → store token/user in AsyncStorage → root layout connects socket with token in auth and emits register(userId).
Direct message:
User types → emits typing/stopTyping to backend; recipient sees indicator.
User sends → emits socket (no-op) + POST /api/messages → backend saves and emits receiveDirectMessage to recipient and also to sender socket.
Sender’s optimistic temp message is merged with server message; reader marks read via /messages/direct/:peerId/read.
Group message: analogous with group membership validation; room group_<id>; read tracked via readBy and /messages/group/:groupId/read.
Follow/unfollow: POST to follow/unfollow → backend updates relations, emits newFollower/unfollowed to target; frontend adjusts counts and shows UI.
Notifications: On like/comment/reply/mention/save → backend createNotification persists + emits newNotification to receiver if online; frontend shows banner and updates count; notifications list fetched via REST.
Notable issues/inconsistencies to address
Frontend endpoints
ApiService.login/register/logout/updateProfile use /auth/... or /users/profile which do not exist server-side. The app currently bypasses ApiService.login by using app/login.tsx with /api/users/login. Unify endpoints (prefer /api/users/login and /api/users/register) and remove dead methods or implement matching backend routes.
Follow/unfollow in app/otherProfile.tsx
Uses DELETE /api/users/:id/follow to unfollow, but backend expects POST /api/users/:id/unfollow. Fix to use the correct endpoint/method.
Mixed socket usage
app/otherProfile.tsx creates its own io(...) instance instead of using socketService, which can cause duplicate connections or inconsistent listeners. Standardize on socketService.
Hardcoded base URL/IPs
Multiple files hardcode http://192.168.53.127:5000 and /api. Centralize via a config/env and reuse in all services/screens to avoid drift.
CORS config
origin: "*" with credentials: true isn’t valid combination; either restrict origins or disable credentials. Consider tightening before production.
Posts filter
getAllPosts builds filter for hashtag/mention but queries Post.find({ user: userId }), ignoring filters. Decide intended behavior and apply filter or split endpoints.
Persisting “follow” notifications
Notification supports type "follow", but follow controller does not call createNotification. If “follow” should appear in notifications list, call createNotification there.
Minor: test HTML files under Backend won’t pass socket auth (no token in handshake). For local debugging, add auth: { token } or disable auth in a test build.
How to run
Backend: set MONGO_URI, JWT_SECRET, and Cloudinary envs; cd Backend && npm i && npm run start (nodemon).

Frontend: cd Frontend && npm i && npm run start (Expo). Ensure API/socket base URL matches your machine/network.

If you want, I can unify base URLs, fix the follow/unfollow endpoint in otherProfile, and align ApiService auth routes. Just say the word.

Fixed and validated the full architecture map above. -->



<!-- 

Feature overview 
Feature Documentation: Daily Circle
Feature Name

Daily Circle – A once-a-day, post-to-unlock, streaked prompt.

Objective

Introduce a habit-forming, daily social interaction within the app to increase engagement, retention, and social interaction without cloning existing Stories or Spotlight features.

Core Principles

Scarcity – Only one prompt per day, delivered at a fixed time.

Social Pressure – Users can only see friends’ posts after posting their own (BeReal-style).

Streaks – Personal and group streaks encourage continued engagement with gentle loss aversion.

Low Friction – Simple, fast post (photo/video/text) with no perfection pressure.

User Flow

Daily Prompt Drop

Appears at the top of Home and in Groups.

Countdown timer shows time remaining to post.

Compose & Submit

Users have 2–3 minutes to post once.

Media can be photo, video, or text.

Optional “Late Pass” once per week for streak forgiveness.

Feed Unlock

Feed is locked until the user posts.

After posting, friends’ posts appear in chronological or grid view.

Streak Tracking

Personal streak (consecutive daily posts).

Group streak (participation of group members).

Displayed via streak counters and small badges.

Notifications

Real-time updates via sockets:

dailyPromptDrop → prompt notification

friendPostedDaily → unlock notification

Group variants if in a Circle

Backend Architecture

Collections

DailyPrompt: { date, text, dropsAt }

DailyCircleEntry: { userId, groupId?, mediaUrl, createdAt }

DailyStreak: { userId, currentStreak, longestStreak, updatedAt }

API Endpoints

GET /dailyPrompt → Fetch today’s prompt

POST /dailyCircleEntry → Submit user entry (checks for duplicates)

GET /dailyCircleFeed → Fetch friends’ posts (locked until user posts)

GET/PUT /dailyStreak → Fetch/update streaks

Optional cron job to generate future prompts

Sockets

dailyPromptDrop, friendPostedDaily, group variants

Push notifications on first posts or milestone streaks

Storage

Cloudinary (or equivalent) for media uploads

TTL 24–48h for temporary data cleanup

Frontend Implementation

Top Banner

Countdown to daily prompt

Streak indicator (personal/group)

Composer

Quick post (photo/video/text)

2-minute soft timer

Single retry allowed

Feed

Locked state until user posts

Friends’ posts in chronological grid

Group view: participation rings + streak counters

Privacy Controls

Everyone, Followers, Group-only

Moderation

Media review queue

Report/remove functionality

UX Considerations

Time-limited posts reduce perfectionism and friction

Social lock creates peer motivation without heavy FOMO

Visual streak indicators encourage habitual engagement

Optional “late pass” makes streaks humane

Rollout Plan

Phase 1 – Friends-only Circles

Phase 2 – Small groups or communities

Phase 3 – City or interest-based Circles

Success Metrics

Prompt open rate

Daily post rate

Average streak length

D1/D7 retention lifts

Group participation %

Average time-to-post

Notifications click-through rate (CTR)

Technical Notes

Node.js backend with MongoDB collections for prompts, entries, and streaks

Socket.io (or similar) for real-time updates

Cloud storage (e.g., Cloudinary) for media

TTL cleanup for ephemeral data

Optional cron job for scheduled prompt generation

Visual Diagram (Recommended for Devs/Designers)
DailyPrompt Drop
      │
      ▼
   User sees prompt
      │
      ▼
Compose post → Submit
      │
      ▼
   Unlock feed
      │
      ▼
Update streaks + badges
      │
      ▼
Notify friends/groups via sockets

Summary

Daily Circle introduces a daily ritual, balancing scarcity, social pressure, and streak mechanics to drive habit-forming engagement. It’s lightweight, quick, and encourages regular return visits without cloning existing social features like Stories. -->