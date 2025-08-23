# API Documentation

## Base URL
```
http://localhost:5000/api
```

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

## Response Formats

### Success Response
```json
{
  "success": true,
  "data": {},
  "message": "Operation successful"
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error information"
}
```

### Pagination Response
```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

## Endpoints

### Authentication

#### Register User
```http
POST /users/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "name": "John Doe",
    "email": "john@example.com",
    "profilePic": ""
  }
}
```

#### Login User
```http
POST /users/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "name": "John Doe",
    "email": "john@example.com",
    "profilePic": ""
  }
}
```

### Users

#### Get Current User Profile
```http
GET /users/me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "user": {
    "_id": "user_id",
    "name": "John Doe",
    "email": "john@example.com",
    "profilePic": "https://example.com/image.jpg",
    "bio": "User bio",
    "website": "https://example.com",
    "followers": ["follower_id_1", "follower_id_2"],
    "following": ["following_id_1", "following_id_2"],
    "savedPosts": ["post_id_1", "post_id_2"],
    "closeFriends": ["friend_id_1", "friend_id_2"],
    "blockedUsers": ["blocked_id_1"],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Search Users
```http
GET /users/search?q=john&page=1&limit=10&groupId=group_id&exclude=user_id_1,user_id_2
Authorization: Bearer <token>
```

**Query Parameters:**
- `q` (string, required): Search query
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Results per page (default: 10, max: 50)
- `groupId` (string, optional): Exclude group members from search
- `exclude` (string, optional): Comma-separated user IDs to exclude

**Response:**
```json
{
  "success": true,
  "users": [
    {
      "_id": "user_id",
      "name": "John Doe",
      "username": "johndoe",
      "profilePic": "https://example.com/image.jpg"
    }
  ],
  "page": 1,
  "limit": 10
}
```

#### Get User by ID
```http
GET /users/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "user": {
    "_id": "user_id",
    "name": "John Doe",
    "profilePic": "https://example.com/image.jpg",
    "bio": "User bio",
    "followers": ["follower_id_1", "follower_id_2"],
    "following": ["following_id_1", "following_id_2"]
  }
}
```

#### Follow User
```http
POST /users/:id/follow
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Followed successfully"
}
```

#### Unfollow User
```http
POST /users/:id/unfollow
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Unfollowed successfully"
}
```

#### Get User Followers
```http
GET /users/:id/followers?page=1&limit=20
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "page": 1,
  "pages": 5,
  "total": 100,
  "users": [
    {
      "_id": "follower_id",
      "name": "Follower Name",
      "username": "follower",
      "profilePic": "https://example.com/image.jpg"
    }
  ]
}
```

#### Get User Following
```http
GET /users/:id/following?page=1&limit=20
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "page": 1,
  "pages": 5,
  "total": 100,
  "users": [
    {
      "_id": "following_id",
      "name": "Following Name",
      "username": "following",
      "profilePic": "https://example.com/image.jpg"
    }
  ]
}
```

#### Close Friends Management

##### List Close Friends
```http
GET /users/me/close-friends
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "users": [
    {
      "_id": "friend_id",
      "name": "Close Friend",
      "username": "closefriend",
      "profilePic": "https://example.com/image.jpg"
    }
  ]
}
```

##### Add Close Friend
```http
POST /users/close-friends/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true
}
```

##### Remove Close Friend
```http
DELETE /users/close-friends/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true
}
```

#### Block/Unblock Users

##### Block User
```http
POST /users/:id/block
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true
}
```

##### Unblock User
```http
POST /users/:id/unblock
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true
}
```

#### Push Token Registration
```http
POST /users/me/push-token
Authorization: Bearer <token>
Content-Type: application/json

{
  "token": "expo_push_token_here"
}
```

**Response:**
```json
{
  "success": true
}
```

### Posts

#### Create Post
```http
POST /posts
Authorization: Bearer <token>
Content-Type: multipart/form-data

{
  "title": "Post Title",
  "description": "Post description with #hashtags and @mentions",
  "file": <media_file>,
  "lng": 123.456,
  "lat": 78.901,
  "locationName": "New York, NY"
}
```

**Response:**
```json
{
  "_id": "post_id",
  "title": "Post Title",
  "description": "Post description with #hashtags and @mentions",
  "mediaUrl": "https://cloudinary.com/image.jpg",
  "user": "user_id",
  "hashtags": ["hashtags", "mentions"],
  "mentions": ["mentions"],
  "likes": [],
  "comments": [],
  "locationName": "New York, NY",
  "geo": {
    "type": "Point",
    "coordinates": [123.456, 78.901]
  },
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

#### Get Posts Feed
```http
GET /posts?page=1&limit=10&hashtag=travel&mention=john&userId=user_id
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Posts per page (default: 10)
- `hashtag` (string, optional): Filter by hashtag
- `mention` (string, optional): Filter by mention
- `userId` (string, optional): Get posts by specific user

**Response:**
```json
{
  "success": true,
  "currentPage": 1,
  "totalPages": 10,
  "totalPosts": 100,
  "posts": [
    {
      "_id": "post_id",
      "title": "Post Title",
      "description": "Post description",
      "mediaUrl": "https://cloudinary.com/image.jpg",
      "user": {
        "_id": "user_id",
        "name": "John Doe",
        "profilePic": "https://example.com/image.jpg"
      },
      "hashtags": ["travel", "adventure"],
      "mentions": ["john"],
      "likes": ["user_id_1", "user_id_2"],
      "comments": [
        {
          "_id": "comment_id",
          "user": {
            "_id": "user_id",
            "name": "Commenter",
            "profilePic": "https://example.com/image.jpg"
          },
          "text": "Great post!",
          "likes": ["user_id_1"],
          "replies": [],
          "createdAt": "2024-01-01T00:00:00.000Z"
        }
      ],
      "locationName": "New York, NY",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### Get User's Posts
```http
GET /posts/me?page=1&limit=10&hashtag=travel&mention=john
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "currentPage": 1,
  "totalPages": 5,
  "totalPosts": 50,
  "posts": [...],
  "mentionedPosts": [...]
}
```

#### Get Explore Posts
```http
GET /posts/explore?page=1&limit=18&lat=40.7128&lng=-74.0060
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Posts per page (default: 18)
- `lat` (number, optional): User latitude for proximity-based content
- `lng` (number, optional): User longitude for proximity-based content

**Response:**
```json
{
  "success": true,
  "posts": [...]
}
```

#### Delete Post
```http
DELETE /posts/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Post deleted successfully"
}
```

#### Like/Unlike Post
```http
PUT /posts/:id/like
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Post liked successfully"
}
```

#### Add Comment
```http
POST /posts/:id/comment
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "Great post! #awesome @john"
}
```

**Response:**
```json
{
  "_id": "comment_id",
  "user": {
    "_id": "user_id",
    "name": "Commenter",
    "profilePic": "https://example.com/image.jpg"
  },
  "text": "Great post! #awesome @john",
  "likes": [],
  "replies": [],
  "hashtags": ["awesome"],
  "mentions": ["john"],
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

#### Reply to Comment
```http
POST /posts/:id/comment/:commentId/reply
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "I agree!"
}
```

**Response:**
```json
{
  "_id": "reply_id",
  "user": {
    "_id": "user_id",
    "name": "Replier",
    "profilePic": "https://example.com/image.jpg"
  },
  "text": "I agree!",
  "likes": [],
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

#### Like/Unlike Comment or Reply
```http
PUT /posts/:id/comment/like
Authorization: Bearer <token>
Content-Type: application/json

{
  "commentId": "comment_id",
  "replyId": "reply_id" // Optional, for liking replies
}
```

**Response:**
```json
{
  "message": "Comment liked successfully"
}
```

#### Edit Comment
```http
PUT /posts/:id/comment/:commentId
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "Updated comment text"
}
```

**Response:**
```json
{
  "message": "Comment updated successfully"
}
```

#### Edit Reply
```http
PUT /posts/:id/comment/:commentId/reply/:replyId
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "Updated reply text"
}
```

**Response:**
```json
{
  "message": "Reply updated successfully"
}
```

#### Delete Comment
```http
DELETE /posts/:id/comment/:commentId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Comment deleted successfully"
}
```

#### Delete Reply
```http
DELETE /posts/:id/comment/:commentId/reply/:replyId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Reply deleted successfully"
}
```

#### Save Post
```http
PUT /posts/:id/save
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Post saved successfully"
}
```

#### Get Saved Posts
```http
GET /posts/saved?page=1&limit=10
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "currentPage": 1,
  "totalPages": 5,
  "totalPosts": 50,
  "posts": [...]
}
```

### Messages

#### Get Chat List
```http
GET /messages/chats
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "chats": [
    {
      "_id": "chat_id",
      "type": "direct",
      "participants": [
        {
          "_id": "user_id",
          "name": "John Doe",
          "profilePic": "https://example.com/image.jpg"
        }
      ],
      "lastMessage": {
        "_id": "message_id",
        "text": "Hello!",
        "from": "user_id",
        "createdAt": "2024-01-01T00:00:00.000Z"
      },
      "unreadCount": 2
    },
    {
      "_id": "group_id",
      "type": "group",
      "name": "Group Name",
      "groupPic": "https://example.com/group.jpg",
      "lastMessage": {
        "_id": "message_id",
        "text": "Group message",
        "from": "user_id",
        "createdAt": "2024-01-01T00:00:00.000Z"
      },
      "unreadCount": 5
    }
  ]
}
```

#### Get Direct Messages
```http
GET /messages/direct/:userId?page=1&limit=20
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "messages": [
    {
      "_id": "message_id",
      "text": "Hello!",
      "from": {
        "_id": "user_id",
        "name": "John Doe",
        "profilePic": "https://example.com/image.jpg"
      },
      "to": "recipient_id",
      "messageType": "direct",
      "isRead": true,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "page": 1,
  "hasMore": true
}
```

#### Send Message
```http
POST /messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "to": "recipient_user_id",
  "text": "Hello!",
  "messageType": "direct"
}
```

**For Group Messages:**
```json
{
  "groupId": "group_id",
  "text": "Hello group!",
  "messageType": "group"
}
```

**Response:**
```json
{
  "_id": "message_id",
  "text": "Hello!",
  "from": {
    "_id": "user_id",
    "name": "John Doe",
    "profilePic": "https://example.com/image.jpg"
  },
  "to": "recipient_id",
  "messageType": "direct",
  "isRead": false,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

#### Mark Direct Messages as Read
```http
POST /messages/direct/:peerId/read
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Messages marked as read"
}
```

#### Mark Group Messages as Read
```http
POST /messages/group/:groupId/read
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Messages marked as read"
}
```

### Groups

#### Create Group
```http
POST /groups
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Group Name",
  "description": "Group description",
  "members": ["user_id_1", "user_id_2"]
}
```

**Response:**
```json
{
  "_id": "group_id",
  "name": "Group Name",
  "description": "Group description",
  "creator": "user_id",
  "admins": ["user_id"],
  "members": ["user_id", "user_id_1", "user_id_2"],
  "groupPic": "",
  "isActive": true,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

#### Get User's Groups
```http
GET /groups
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "groups": [
    {
      "_id": "group_id",
      "name": "Group Name",
      "description": "Group description",
      "groupPic": "https://example.com/group.jpg",
      "memberCount": 5,
      "unreadCount": 2,
      "lastMessage": {
        "text": "Last message",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    }
  ]
}
```

#### Get Group Details
```http
GET /groups/:groupId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "group": {
    "_id": "group_id",
    "name": "Group Name",
    "description": "Group description",
    "creator": {
      "_id": "user_id",
      "name": "Creator Name",
      "profilePic": "https://example.com/image.jpg"
    },
    "admins": [
      {
        "_id": "admin_id",
        "name": "Admin Name",
        "profilePic": "https://example.com/image.jpg"
      }
    ],
    "members": [
      {
        "_id": "member_id",
        "name": "Member Name",
        "profilePic": "https://example.com/image.jpg"
      }
    ],
    "groupPic": "https://example.com/group.jpg",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Get Group Messages
```http
GET /groups/:groupId/messages?page=1&limit=20
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "messages": [
    {
      "_id": "message_id",
      "text": "Group message",
      "from": {
        "_id": "user_id",
        "name": "John Doe",
        "profilePic": "https://example.com/image.jpg"
      },
      "group": "group_id",
      "messageType": "group",
      "readBy": ["user_id_1", "user_id_2"],
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "page": 1,
  "hasMore": true
}
```

#### Add Group Members
```http
POST /groups/:groupId/members
Authorization: Bearer <token>
Content-Type: application/json

{
  "members": ["user_id_1", "user_id_2"]
}
```

**Response:**
```json
{
  "message": "Members added successfully"
}
```

#### Remove Group Member
```http
DELETE /groups/:groupId/members/:memberId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Member removed successfully"
}
```

#### Promote to Admin
```http
POST /groups/:groupId/admins/:memberId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Member promoted to admin"
}
```

#### Demote Admin
```http
DELETE /groups/:groupId/admins/:adminId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Admin demoted to member"
}
```

### Daily Circle

#### Get Today's Prompt
```http
GET /daily/prompt
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "prompt": {
    "_id": "prompt_id",
    "dateKey": "2024-01-01",
    "text": "Share a moment from your day",
    "dropsAt": "2024-01-01T12:00:00.000Z"
  },
  "posted": false
}
```

#### Post Daily Entry
```http
POST /daily/entry
Authorization: Bearer <token>
Content-Type: multipart/form-data

{
  "text": "My daily response",
  "file": <media_file>,
  "visibility": "followers"
}
```

**Response:**
```json
{
  "_id": "entry_id",
  "user": {
    "_id": "user_id",
    "name": "John Doe",
    "profilePic": "https://example.com/image.jpg"
  },
  "dateKey": "2024-01-01",
  "mediaUrl": "https://cloudinary.com/image.jpg",
  "text": "My daily response",
  "visibility": "followers",
  "views": [],
  "viewsCount": 0,
  "reactions": [],
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

#### Get Daily Feed
```http
GET /daily/feed
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "entries": [
    {
      "_id": "entry_id",
      "user": {
        "_id": "user_id",
        "name": "John Doe",
        "profilePic": "https://example.com/image.jpg"
      },
      "dateKey": "2024-01-01",
      "mediaUrl": "https://cloudinary.com/image.jpg",
      "text": "Daily response",
      "visibility": "followers",
      "viewsCount": 5,
      "reactions": [
        {
          "user": "user_id",
          "type": "heart",
          "at": "2024-01-01T00:00:00.000Z"
        }
      ],
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### Get User Streak
```http
GET /daily/streak
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "streak": {
    "_id": "streak_id",
    "user": "user_id",
    "currentStreak": 7,
    "longestStreak": 30,
    "hitMilestone": false,
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Get Daily Rings
```http
GET /daily/rings
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "rings": [
    {
      "user": {
        "_id": "user_id",
        "name": "John Doe",
        "profilePic": "https://example.com/image.jpg"
      },
      "entry": {
        "_id": "entry_id",
        "mediaUrl": "https://cloudinary.com/image.jpg",
        "text": "Daily response"
      }
    }
  ]
}
```

#### Get User's Daily Entry
```http
GET /daily/entry/:userId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "entry": {
    "_id": "entry_id",
    "user": {
      "_id": "user_id",
      "name": "John Doe",
      "profilePic": "https://example.com/image.jpg"
    },
    "dateKey": "2024-01-01",
    "mediaUrl": "https://cloudinary.com/image.jpg",
    "text": "Daily response",
    "visibility": "followers",
    "viewsCount": 5,
    "reactions": [],
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Get Group Daily Feed
```http
GET /daily/group/:groupId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "entries": [...],
  "group": {
    "_id": "group_id",
    "name": "Group Name",
    "groupPic": "https://example.com/group.jpg"
  }
}
```

#### View Daily Entry
```http
POST /daily/view
Authorization: Bearer <token>
Content-Type: application/json

{
  "entryId": "entry_id"
}
```

**Response:**
```json
{
  "success": true,
  "message": "View recorded"
}
```

#### React to Daily Entry
```http
POST /daily/react
Authorization: Bearer <token>
Content-Type: application/json

{
  "entryId": "entry_id",
  "type": "heart"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Reaction added"
}
```

#### Toggle Highlight
```http
POST /daily/highlight
Authorization: Bearer <token>
Content-Type: application/json

{
  "entryId": "entry_id"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Highlight toggled"
}
```

#### Get Highlights
```http
GET /daily/highlights
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "highlights": [
    {
      "_id": "entry_id",
      "user": {
        "_id": "user_id",
        "name": "John Doe",
        "profilePic": "https://example.com/image.jpg"
      },
      "mediaUrl": "https://cloudinary.com/image.jpg",
      "text": "Highlighted entry",
      "dateKey": "2024-01-01",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### Get Reactions Summary
```http
GET /daily/:entryId/reactions
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "reactions": {
    "heart": 5,
    "laugh": 2,
    "wow": 1
  }
}
```

#### Get Reactors List
```http
GET /daily/:entryId/reactors
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "reactors": [
    {
      "user": {
        "_id": "user_id",
        "name": "John Doe",
        "profilePic": "https://example.com/image.jpg"
      },
      "type": "heart",
      "at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### Get Captions
```http
GET /daily/:entryId/captions
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "captions": [
    {
      "start": 0,
      "end": 5,
      "text": "Caption text"
    }
  ]
}
```

#### Update Captions
```http
PUT /daily/:entryId/captions
Authorization: Bearer <token>
Content-Type: application/json

{
  "captions": [
    {
      "start": 0,
      "end": 5,
      "text": "Updated caption"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Captions updated"
}
```

### Notifications

#### Get Notifications
```http
GET /notifications?page=1&limit=20
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "notifications": [
    {
      "_id": "notification_id",
      "sender": {
        "_id": "sender_id",
        "name": "Sender Name",
        "profilePic": "https://example.com/image.jpg"
      },
      "type": "like",
      "post": {
        "_id": "post_id",
        "title": "Post Title",
        "mediaUrl": "https://cloudinary.com/image.jpg"
      },
      "text": "liked your post",
      "isRead": false,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "page": 1,
  "hasMore": true
}
```

#### Mark Notification as Read
```http
PUT /notifications/:id/read
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Notification marked as read"
}
```

#### Mark All Notifications as Read
```http
PUT /notifications/read-all
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "All notifications marked as read"
}
```

#### Delete Notification
```http
DELETE /notifications/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Notification deleted"
}
```

#### Get Unread Count
```http
GET /notifications/unread-count
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "count": 5
}
```

### Upload

#### Upload Media
```http
POST /upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

{
  "file": <media_file>
}
```

**Response:**
```json
{
  "success": true,
  "url": "https://cloudinary.com/image.jpg"
}
```

## Socket.IO Events

### Client to Server Events

#### Register User
```javascript
socket.emit('register', userId);
```

#### Join Group
```javascript
socket.emit('joinGroup', groupId);
```

#### Leave Group
```javascript
socket.emit('leaveGroup', groupId);
```

#### Typing Indicator (Direct)
```javascript
socket.emit('typing', { from: userId, to: recipientId });
```

#### Stop Typing (Direct)
```javascript
socket.emit('stopTyping', { from: userId, to: recipientId });
```

#### Typing Indicator (Group)
```javascript
socket.emit('groupTyping', { 
  groupId: groupId, 
  userId: userId, 
  userName: userName 
});
```

#### Stop Typing (Group)
```javascript
socket.emit('groupStopTyping', { 
  groupId: groupId, 
  userId: userId 
});
```

### Server to Client Events

#### User Status Change
```javascript
socket.on('userStatusChange', (data) => {
  // data: { userId: string, status: 'online' | 'offline' }
});
```

#### Receive Direct Message
```javascript
socket.on('receiveDirectMessage', (message) => {
  // message: Message object
});
```

#### Receive Group Message
```javascript
socket.on('receiveGroupMessage', (message) => {
  // message: Message object
});
```

#### Typing Indicator
```javascript
socket.on('typing', (data) => {
  // data: { from: userId }
});
```

#### Stop Typing
```javascript
socket.on('stopTyping', (data) => {
  // data: { from: userId }
});
```

#### Group Typing
```javascript
socket.on('groupTyping', (data) => {
  // data: { userId: string, userName: string, groupId: string }
});
```

#### Group Stop Typing
```javascript
socket.on('groupStopTyping', (data) => {
  // data: { userId: string, groupId: string }
});
```

#### New Notification
```javascript
socket.on('newNotification', (data) => {
  // data: { notification: Notification object, message: string }
});
```

#### New Follower
```javascript
socket.on('newFollower', (data) => {
  // data: { followerId: string, followerName: string, followedId: string }
});
```

#### Unfollowed
```javascript
socket.on('unfollowed', (data) => {
  // data: { unfollowerId: string, unfollowerName: string, unfollowedId: string }
});
```

#### Daily Posted
```javascript
socket.on('dailyPosted', (data) => {
  // data: { entry: DailyCircleEntry object }
});
```

#### Daily Ring
```javascript
socket.on('dailyRing', (ring) => {
  // ring: DailyCircleEntry object
});
```

## Error Codes

### HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

### Common Error Messages
- `"User already exists"` - Email already registered
- `"Invalid email or password"` - Login credentials incorrect
- `"Not authorized, token failed"` - Invalid or expired JWT token
- `"Not authorized, no token"` - Missing authorization header
- `"User not found"` - User ID doesn't exist
- `"Already following"` - User already followed
- `"Title is required"` - Post title missing
- `"Message text is required"` - Message content missing
- `"Already posted today"` - Daily entry already exists
- `"Recipient is required for direct messages"` - Missing recipient for direct message
- `"Group ID is required for group messages"` - Missing group ID for group message

## Rate Limiting

The API implements rate limiting to prevent abuse:
- **Authentication endpoints**: 5 requests per minute
- **General endpoints**: 100 requests per 15 minutes
- **Upload endpoints**: 10 requests per minute

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Pagination

Most list endpoints support pagination with the following query parameters:
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default varies by endpoint, max: 50)

Pagination metadata is included in responses:
```json
{
  "currentPage": 1,
  "totalPages": 10,
  "totalItems": 100,
  "hasMore": true
}
```

## File Upload

### Supported File Types
- **Images**: jpg, jpeg, png, gif
- **Videos**: mp4, mov, webm
- **Max Size**: 50MB per file

### Upload Process
1. Send file as `multipart/form-data`
2. Include `Authorization` header with Bearer token
3. File is uploaded to Cloudinary
4. Response includes the public URL

### Example Upload
```javascript
const formData = new FormData();
formData.append('file', {
  uri: fileUri,
  type: 'image/jpeg',
  name: 'upload.jpg',
});

const response = await fetch(`${API_BASE_URL}/upload`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'multipart/form-data',
  },
  body: formData,
});
```

This comprehensive API documentation covers all endpoints, request/response formats, Socket.IO events, and implementation details for the social media application.