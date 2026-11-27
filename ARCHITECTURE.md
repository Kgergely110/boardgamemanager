# 🏗️ Board Game Manager - Architecture Guide

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
│  React 18 + TypeScript + Tailwind CSS + Framer Motion           │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   Library    │  │   Play Logs  │  │  Glossary    │           │
│  │   Browser   │  │   Manager    │  │  Editor      │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                   │
│  State: Zustand (Auth, Shelves, Games, Players)                │
│  HTTP Client: Axios + RESTful API                              │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ HTTPS/JSON
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY LAYER                           │
│  Express.js + TypeScript + Helmet + CORS                        │
│                                                                   │
│  Routes:                                                         │
│  ├─ /api/auth          (Login, Register)                        │
│  ├─ /api/shelves       (CRUD)                                   │
│  ├─ /api/games         (CRUD + Search + Upload)                │
│  ├─ /api/play-logs     (CRUD + Analytics)                      │
│  ├─ /api/players       (CRUD)                                   │
│  ├─ /api/tags          (CRUD)                                   │
│  └─ /api/glossary      (CRUD)                                   │
│                                                                   │
│  Middleware:                                                     │
│  ├─ Authentication (JWT verification)                           │
│  ├─ Validation (Zod schema checking)                           │
│  ├─ Error Handling (Centralized)                               │
│  └─ Logging (Request tracking)                                 │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ SQL
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                             │
│  Prisma ORM + TypeScript                                        │
│                                                                   │
│  ├─ Query Building (Type-safe)                                 │
│  ├─ Relationship Loading                                        │
│  ├─ Transaction Support                                         │
│  └─ Automatic Migration Management                              │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ PostgreSQL Protocol
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                   DATA PERSISTENCE LAYER                         │
│  PostgreSQL 16 (Docker Container)                               │
│                                                                   │
│  Tables:                                                         │
│  ├─ players          (Users who can log in)                     │
│  ├─ shelves          (Physical containers)                      │
│  ├─ games            (Inventory items)                          │
│  ├─ tags             (Game labels)                              │
│  ├─ game_tags        (Many-to-many junction)                    │
│  ├─ game_documents   (Rules, missions, etc)                    │
│  ├─ play_logs        (Game sessions)                            │
│  ├─ play_log_participants (Players in sessions)                │
│  └─ glossary_entries (Game concepts)                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Request Flow Example: Login

```
User Input (React)
       │
       ▼
TypeScript Validation (Zod)
       │
       ▼
Axios POST /api/auth/login
       │
       ▼
Express Route Handler
       │
       ▼
Check Auth Middleware
       │
       ▼
Service Layer (Business Logic)
  ├─ Query player from DB (Prisma)
  ├─ Compare password (Bcryptjs)
  ├─ Generate JWT token
       │
       ▼
Return JSON Response
       │
       ▼
Zustand Store Update
       │
       ▼
React Component Re-render
       │
       ▼
Redirect to Library View
```

---

## Data Model Architecture

### Entity Relationships

```
PLAYERS (Auth)
  │
  └─→ USERNAME, EMAIL, PASSWORD_HASH, AVATAR
  
SHELVES (Physical Storage)
  │
  ├─→ NAME, TYPE, COLOR, POSITION
  ├─→ DIMENSIONS (W × H × D)
  ├─→ SHELF_COUNT (number of compartments)
  │
  └─→ [1:N] GAMES

GAMES (Inventory)
  │
  ├─→ NAME, MAKER, RELEASE_YEAR
  ├─→ IMAGE_URL, ORIENTATION
  ├─→ RULES (Markdown)
  ├─→ MIN/MAX_PLAYERS, AGE_LIMIT, PLAY_TIME
  │
  ├─→ [N:1] SHELF (Location)
  ├─→ [N:M] TAGS (RPG, Family, Casual, etc.)
  ├─→ [1:N] GAME_DOCUMENTS (Rules, Missions)
  └─→ [1:N] PLAY_LOGS

TAGS (Game Labels)
  │
  ├─→ NAME, COLOR, ICON
  └─→ [N:M] GAMES

GAME_DOCUMENTS (Markdown Content)
  │
  ├─→ TITLE, CONTENT (Markdown), ORDER
  └─→ [N:1] GAME

PLAY_LOGS (Game Sessions)
  │
  ├─→ DATE, DURATION, NOTES
  ├─→ [N:1] GAME
  └─→ [1:N] PLAY_LOG_PARTICIPANTS

PLAY_LOG_PARTICIPANTS (Session Players)
  │
  ├─→ SCORE, PLACEMENT (1st, 2nd, etc.)
  ├─→ [N:1] PLAY_LOG
  └─→ [N:1] PLAYER

GLOSSARY_ENTRIES (Game Concepts)
  │
  ├─→ TERM, DEFINITION, IMAGE_URL
  └─→ RELATED_TERMS (array of term IDs)
```

---

## Authentication Flow

```
                    LOGIN FLOW
                    
┌─────────────────────────────────────────────────────────────┐
│ 1. User submits username + password                         │
│    Frontend: React component → Zod validation              │
└──────────────────────┬────────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────────┐
│ 2. POST /api/auth/login                                   │
│    Headers: Content-Type: application/json               │
│    Body: { username, password }                          │
└──────────────────────┬────────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────────┐
│ 3. Backend Auth Service                                   │
│    a) Query DB for player by username                    │
│    b) Compare password hash (Bcryptjs)                   │
│    c) If valid, sign JWT token                           │
│    d) Return { token, player }                           │
└──────────────────────┬────────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────────┐
│ 4. Frontend Stores Token                                  │
│    a) Save token to localStorage                         │
│    b) Update Zustand auth store                          │
│    c) Redirect to Library view                           │
└──────────────────────┬────────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────────┐
│ 5. Protected API Calls                                    │
│    Headers: Authorization: Bearer {token}                │
│    Middleware: verifyToken() → Attach user to request   │
└─────────────────────────────────────────────────────────┘

                   TOKEN EXPIRATION
                   
JWT expires after configured duration (default: 7 days)
   └─→ User gets 401 Unauthorized
   └─→ Frontend redirects to login
   └─→ Refresh token flow (future enhancement)
```

---

## API Response Structure

### Success Response (200)
```json
{
  "data": { /* resource data */ },
  "message": "Operation successful",
  "timestamp": "2024-11-17T00:22:56.101Z"
}
```

### Paginated Response (200)
```json
{
  "data": [ /* array of items */ ],
  "pagination": {
    "skip": 0,
    "take": 20,
    "total": 150,
    "page": 1,
    "pages": 8
  },
  "timestamp": "2024-11-17T00:22:56.101Z"
}
```

### Error Response (4xx/5xx)
```json
{
  "error": "Error message",
  "code": "VALIDATION_ERROR",
  "details": [ /* field-level errors if applicable */ ],
  "timestamp": "2024-11-17T00:22:56.101Z"
}
```

---

## File Upload Architecture

```
User Selects Game Image
       │
       ▼
Frontend: Validation (Type, Size)
  ├─ Max 10MB
  ├─ JPEG, PNG, WebP only
       │
       ▼
Multipart Form Upload to /api/games/{id}/upload-image
       │
       ▼
Backend: Multer Middleware
  ├─ Validate file again
  ├─ Save to ./uploads/{timestamp}-{filename}
  ├─ Store path in database
       │
       ▼
Return Image URL
       │
       ▼
Frontend: Display in Game Card
```

---

## State Management (Zustand)

```
authStore
├─ user: Player | null
├─ token: string | null
├─ isAuthenticated: boolean
├─ actions
│  ├─ login(username, password)
│  ├─ logout()
│  └─ setToken(token)

shelfStore
├─ shelves: Shelf[]
├─ selectedShelfId: string | null
├─ actions
│  ├─ fetchShelves()
│  ├─ selectShelf(id)
│  ├─ addShelf(shelf)
│  ├─ updateShelf(id, data)
│  └─ deleteShelf(id)

gameStore
├─ games: Game[]
├─ filteredGames: Game[]
├─ searchQuery: string
├─ selectedTags: string[]
├─ actions
│  ├─ fetchGames(shelfId?)
│  ├─ search(query)
│  ├─ filterByTags(tags)
│  ├─ addGame(game)
│  ├─ updateGame(id, data)
│  └─ deleteGame(id)

playerStore
├─ currentPlayer: Player | null
├─ players: Player[]
├─ actions
│  ├─ fetchPlayers()
│  ├─ addPlayer(name)
│  └─ updatePlayer(id, data)
```

---

## Deployment Architecture (Home Server)

```
                     INTERNET (Optional)
                            │
                            ▼
              ┌──────────────────────────┐
              │  Reverse Proxy (Nginx)   │
              │  - HTTPS/SSL             │
              │  - Rate Limiting         │
              │  - Request Routing       │
              └──────────────┬───────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │  Docker Host             │
              │  (Home Server)           │
              │                          │
              │  ┌────────────────────┐  │
              │  │ Docker Compose     │  │
              │  │                    │  │
              │  │ Container 1:       │  │
              │  │ ├─ Frontend (3000) │  │
              │  │                    │  │
              │  │ Container 2:       │  │
              │  │ ├─ Backend (3001)  │  │
              │  │                    │  │
              │  │ Container 3:       │  │
              │  │ ├─ PostgreSQL      │  │
              │  │   (5432)           │  │
              │  │                    │  │
              │  │ Volume: postgres_  │  │
              │  │   data (Backups)   │  │
              │  └────────────────────┘  │
              └──────────────────────────┘

                   LOCAL NETWORK
                   
         Game Computer ──┐
         Tablet         ├─→ Access http://home-server:3000
         Laptop         ┘
```

---

## Security Layers

```
┌────────────────────────────────────────────────────┐
│ Layer 1: Browser                                   │
│ ├─ Validate input before sending                  │
│ ├─ HTTPS only (in production)                     │
│ └─ Secure token storage (httpOnly cookies)        │
└──────────────────────┬───────────────────────────┘

┌──────────────────────▼───────────────────────────┐
│ Layer 2: HTTP                                     │
│ ├─ CORS (allow only frontend origin)             │
│ ├─ Helmet (HTTP security headers)                │
│ └─ Rate limiting (prevent brute force)           │
└──────────────────────┬───────────────────────────┘

┌──────────────────────▼───────────────────────────┐
│ Layer 3: Authentication                           │
│ ├─ JWT token verification                        │
│ ├─ Token expiration checks                       │
│ └─ User identity attachment                      │
└──────────────────────┬───────────────────────────┘

┌──────────────────────▼───────────────────────────┐
│ Layer 4: Input Validation                         │
│ ├─ Zod schema validation                         │
│ ├─ Type safety (TypeScript)                      │
│ └─ XSS prevention                                │
└──────────────────────┬───────────────────────────┘

┌──────────────────────▼───────────────────────────┐
│ Layer 5: Database                                 │
│ ├─ Parameterized queries (Prisma)               │
│ ├─ SQL injection prevention                      │
│ └─ Principle of least privilege                  │
└────────────────────────────────────────────────┘
```

---

## Performance Considerations

### Database Optimization
- Indexes on frequently queried fields (name, shelfId, playedAt)
- Relationships loaded selectively (avoid N+1 queries)
- Pagination for large result sets (games, play logs)

### Frontend Optimization
- Code splitting with React Router
- Image lazy loading
- Memoization for expensive components
- Zustand for local state (minimal re-renders)

### Backend Optimization
- Connection pooling (Prisma)
- Request logging (optional)
- Compression (gzip)
- Caching headers for static assets

---

## Scaling Path (If Needed)

```
Current State (Single Home Server)
└─→ Docker Compose ✅

Small Scaling (Multiple Users)
└─→ Reverse Proxy + Docker Compose
└─→ Separate PostgreSQL container

Medium Scaling (100+ Games, Complex Queries)
└─→ Read replicas for PostgreSQL
└─→ Cache layer (Redis for frequently accessed data)
└─→ Optimize complex queries

Large Scaling (Thousands of Users)
└─→ Load balancer + Multiple backend instances
└─→ Separate API gateway
└─→ Microservices (if complexity grows)

**Current Project:** Designed for small-to-medium scale ✅
**Home Server Ready:** Yes ✅
```

---

## Development Workflow

```
1. Create Feature Branch
   git checkout -b feature/name

2. Develop Locally
   docker-compose up              (Full stack)
   npm run dev                     (Individual service)

3. Type Safety
   npm run type-check

4. Code Quality
   npm run lint

5. Test Changes
   Manual testing in browser       (Automated tests: future)

6. Commit & Push
   git add .
   git commit -m "..."
   git push origin feature/name

7. Deploy to Home Server
   git pull origin main
   docker-compose down
   docker-compose up -d            (Detached mode)
```

---

**Next: Choose a feature to implement and start building!** 🚀
