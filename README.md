# 🎬 WatchyMe

> Watch together. Play together. Vibe together.

A real-time watch party and social platform combining the best of **Google Meet** and **Discord** — synchronized video playback, live video calls, screen sharing, in-browser games, and community servers. All in one place.

---

## ✨ Features

### 🎥 Watch Room
- Synchronized YouTube playback across all users
- Host controls — play, pause, seek for everyone
- Upload and watch your own videos together
- Live reactions and emoji rain

### 🖥️ Screen Room
- Smooth 60fps screen sharing
- Real-time video filters and background change
- Multi-presenter support
- Google Meet quality via WebRTC + LiveKit

### 🎮 Game Room
- Built-in Chess and Ludo
- Synchronized game state via Socket.io
- Voice chat while playing
- Leaderboard system

### 💬 Social Layer (Discord-style)
- Community servers with channels
- Direct messages
- Friends list with online presence
- Server events and watch party scheduling
- Activity feed

### 📹 Video Calls
- Production-grade video/audio via LiveKit SFU
- Camera and mic controls
- Background blur and custom backgrounds
- Screen share with filters
- Scales to large rooms

### 🔒 Room System
- Public and private rooms
- Invite by code
- Host controls (kick, mute, transfer host)
- Waiting room support

---

## 🛠️ Tech Stack

### Frontend
| Tech | Purpose |
|---|---|
| React + Vite | UI framework |
| Tailwind CSS | Styling |
| shadcn/ui | Component library |
| React Router v6 | Client-side routing |
| Zustand | Global state management |
| Socket.io Client | Real-time communication |
| Axios | HTTP requests |
| Clerk | Authentication |
| LiveKit React SDK | Video/audio calls |

### Backend
| Tech | Purpose |
|---|---|
| Node.js + Express | Server framework |
| Socket.io | WebSocket real-time events |
| LiveKit Server SDK | Video room token generation |
| Prisma | Database ORM |
| Supabase (PostgreSQL) | Database |
| Clerk | Auth verification |
| Redis (Upstash) | Socket.io scaling + caching |
| Zod | Input validation |
| Helmet + Rate Limiting | Security |

---

## 🏗️ Architecture

```
CLIENT (React)
      │
      ├── REST API (Axios) ──────────────→ Express Routes
      │                                          │
      ├── WebSocket (Socket.io) ────────→ Socket.io Server
      │         │                                │
      │    Real-time events                 Redis Pub/Sub
      │    chat, sync, games                     │
      │                                    Prisma ORM
      └── Video/Audio (LiveKit) ──────→ LiveKit Cloud
                                               │
                                        SFU Architecture
                                     (scales to 100s of users)
```

---

## 📁 Project Structure

```
watchwime/
├── client/                    # React frontend
│   ├── src/
│   │   ├── pages/             # Landing, Home, Server, Room
│   │   ├── components/
│   │   │   ├── landing/       # Hero, Navbar, Features
│   │   │   ├── home/          # Sidebar, FriendsList
│   │   │   ├── server/        # Channels, Members, Chat
│   │   │   ├── room/          # VideoGrid, Controls, Games
│   │   │   └── ui/            # Shared components
│   │   ├── hooks/             # useSocket, useWebRTC, useRoom
│   │   ├── store/             # Zustand global state
│   │   └── lib/               # API client, socket client
│   └── package.json
│
└── server/                    # Node.js backend
    ├── src/
    │   ├── routes/            # auth, rooms, servers, users
    │   ├── socket/            # room, chat, presence handlers
    │   ├── middleware/        # auth, rateLimit
    │   ├── services/          # ai, media
    │   └── lib/               # prisma, redis
    └── package.json
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account
- Clerk account
- LiveKit account
- Upstash Redis account

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/watchwime.git
cd watchwime
```

### 2. Setup the client
```bash
cd client
npm install
```

Create `client/.env`:
```env
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
VITE_SERVER_URL=http://localhost:4000
VITE_LIVEKIT_URL=your_livekit_url
```

### 3. Setup the server
```bash
cd server
npm install
```

Create `server/.env`:
```env
PORT=4000
CLIENT_URL=http://localhost:5173
DATABASE_URL=your_supabase_connection_string
CLERK_SECRET_KEY=your_clerk_secret_key
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_URL=your_livekit_url
UPSTASH_REDIS_URL=your_redis_url
```

### 4. Setup the database
```bash
cd server
npx prisma migrate dev
npx prisma generate
```

### 5. Run the development servers

In one terminal:
```bash
cd server
npm run dev
```

In another terminal:
```bash
cd client
npm run dev
```

Visit `http://localhost:5173`

---

## 🌐 Deployment

| Service | Platform |
|---|---|
| Frontend | Netlify |
| Backend | Render |
| Database | Supabase |
| Video | LiveKit Cloud |
| Cache | Upstash Redis |

---

## 📡 Real-time Events

### Room Events
```
create-room       → create a new room
join-room         → join existing room by code
leave-room        → leave current room
room-users        → updated user list
```

### Chat Events
```
send-message      → send chat message
receive-message   → receive chat message
typing-start      → user started typing
typing-stop       → user stopped typing
```

### Video Sync Events
```
video-play        → host pressed play
video-pause       → host pressed pause
video-seek        → host seeked to timestamp
video-sync        → sync new joiner to current time
```

### WebRTC Events
```
webrtc-offer      → peer connection offer
webrtc-answer     → peer connection answer
ice-candidate     → ICE candidate exchange
```

---

## 🔐 Security

- JWT verification on all socket connections via Clerk
- Rate limiting on all API endpoints
- Input validation with Zod
- CORS configured for specific origins
- Environment variables for all secrets
- Helmet.js for HTTP security headers

---

## 🗺️ Roadmap

- [ ] AI meeting summary after room sessions
- [ ] Noise cancellation
- [ ] Browser extension for any website sync
- [ ] Mobile app (React Native)
- [ ] Recording and clips
- [ ] Spatial audio
- [ ] Collaborative whiteboard

---



## 📄 License

MIT License — feel free to use this project as inspiration.

---

<p align="center">Made with ❤️ for squads who refuse to watch alone.</p>
