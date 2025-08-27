## Privacy Semantics and Enforcement

Backend enforcement:
- Direct Messages: Respect `privacy.allowDMsFrom` on recipients (`everyone` | `followers` | `none`). If set to `followers`, only followers can send DMs; `none` blocks all. Additionally, DMs are blocked when either party has blocked the other.
- Typing Indicators: Socket `typing`/`stopTyping` events are relayed only if sender’s `privacy.sendTypingIndicators` is true, recipient’s DM policy allows the sender, and neither party has blocked the other.
- Read Receipts: `messages/direct/:peerId/read` and `messages/group/:groupId/read` update read state only if reader’s `privacy.sendReadReceipts` is true; otherwise, read updates are suppressed. Ephemeral burn-after-read deletions still occur for the reader while suppressing emits when receipts are disabled.
- Presence: `GET /users/presence/online` returns online user IDs filtered by each user’s `privacy.showOnline`. It also hides users who blocked you or whom you blocked.
- Last Seen: `GET /users/:id/last-seen` returns `null` if target’s `privacy.showLastSeen` is false.

Frontend behavior:
- Privacy Screen (`app/settings/privacy.tsx`): Toggles `showOnline`, `showLastSeen`, `sendTypingIndicators`, `sendReadReceipts`, `allowDMsFrom`. On save, it updates socket client privacy to avoid emitting typing when disabled and refreshes presence subtly.
- Chat UI: Read receipts display uses `readBy` events; if receipts are disabled by the reader, the UI avoids double-checks from that user.

Notes:
- Blocking is mutual for privacy surfaces: blocked relationships suppress DMs, typing indicators, and presence visibility between the two users.
- Environment: No additional env required beyond existing JWT/Mongo; behavior is data-driven by `User.privacy` and `User.blockedUsers`.

