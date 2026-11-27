# 🎲 Board Game Manager - Setup & Architecture Guide

## 📋 Project Acknowledgment

You're building a **magical board game inventory system** with:
- **Frontend**: A beautiful library-inspired UI with shelves you can browse and select
- **Backend**: Hardened REST API with comprehensive data models
- **Database**: Rich relational schema for games, play logs, players, documents, and glossary
- **Deployment**: Local network-friendly, runs on home server
- **Design**: Unique, memorable aesthetic (not generic "AI slop")

---

## 🏗️ Architecture Overview

### Three-Layer Stack

```
┌─────────────────────────────────────────┐
│   Frontend (React + Tailwind + Vite)   │
│   - Library shelf browser               │
│   - Game search & filtering             │
│   - Play log management UI              │
│   - Glossary editor                     │
└──────────────┬──────────────────────────┘
               │ HTTP/REST (JSON)
┌──────────────▼──────────────────────────┐
│   Backend (Express + TypeScript)        │
│   - REST API endpoints                  │
│   - JWT authentication                  │
│   - File upload handling                │
│   - Business logic & validation         │
└──────────────┬──────────────────────────┘
               │ SQL
┌──────────────▼──────────────────────────┐
│   Database (PostgreSQL)                 │
│   - Shelves, Games, Players, PlayLogs  │
│   - Documents, Tags, Glossary           │
└─────────────────────────────────────────┘
```

### Data Model Relationships

```
Shelf (1) ──→ (N) Game
  ├─ type, color, position
  └─ can hold multiple games

Game (1) ──→ (N) PlayLog
  ├─ name, maker, year, image
  ├─ min/max players, age, playtime
  └─ links to documents & tags

PlayLog (1) ──→ (N) PlayLogParticipant
  ├─ date, duration, notes
  └─ tracks multiple players per game

PlayLogParticipant (N) ──→ (1) Player
  ├─ score, placement
  └─ links player to game session

Game (N) ──→ (N) Tag
  └─ labels: RPG, Family, Casual, Party, etc.

Game (1) ──→ (N) GameDocument
  └─ Rules, Missions, Expansions (Markdown)

Glossary (independent)
  └─ Game concepts & terms (editable)
```

---

## 🚀 Quick Start

### Option A: Docker (Recommended for Home Server)

```bash
cd boardgamemanager

# Create the root environment file and set a random JWT secret
cp .env.example .env
# Set JWT_SECRET to the output of: openssl rand -hex 32

# Start everything
docker compose up --build

# Access the app
# Frontend: http://localhost:3000
# API: http://localhost:3001/health
```

### Option B: Local Development (Without Docker)

**Backend Setup:**
```bash
cd backend

# Install dependencies
npm install

# Setup PostgreSQL locally or use Docker just for DB:
docker run --name bgm-postgres \
  -e POSTGRES_PASSWORD=bgm_password \
  -e POSTGRES_USER=bgm_user \
  -e POSTGRES_DB=boardgamemanager \
  -p 5432:5432 \
  postgres:16-alpine

# Copy env file
cp .env.example .env

# Run migrations
npx prisma migrate dev --name init

# Start dev server (watches for changes)
npm run dev
```

**Frontend Setup (new terminal):**
```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

The app will be at:
- Frontend: http://localhost:3000
- API: http://localhost:3001

---

## 📁 Project Structure Explained

### Backend (`/backend`)

```
backend/
├── src/
│   ├── index.ts              # Express server entry point
│   ├── lib/
│   │   ├── auth.ts           # JWT token generation/verification
│   │   └── prisma.ts         # Prisma client singleton
│   ├── middlewares/
│   │   └── auth.ts           # Auth middleware for protected routes
│   ├── routes/               # API endpoint definitions (to be created)
│   ├── services/             # Business logic (to be created)
│   ├── types/                # TypeScript interfaces (to be created)
│   └── utils/                # Helper functions (to be created)
├── prisma/
│   └── schema.prisma         # Database schema definition
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
├── Dockerfile                # Docker image definition
└── .env.example              # Environment variables template
```

**Tech Stack:**
- Express.js: REST API framework
- Prisma: ORM for database access
- TypeScript: Type safety
- Zod: Input validation
- Helmet: Security headers
- Bcryptjs: Password hashing
- JWT: Authentication tokens

### Frontend (`/frontend`)

```
frontend/
├── src/
│   ├── App.tsx               # Main app component
│   ├── main.tsx              # React entry point
│   ├── index.css             # Global styles (Tailwind + custom)
│   ├── components/           # Reusable UI components
│   │   └── (Shelf, Game, PlayLog, etc. - to be created)
│   ├── pages/                # Page components
│   │   └── (Library, PlayLogs, Glossary - to be created)
│   ├── stores/               # Zustand state management
│   ├── hooks/                # Custom React hooks
│   ├── types/                # TypeScript interfaces
│   └── utils/                # Helper functions & API client
├── index.html                # HTML entry point
├── vite.config.ts            # Vite bundler config
├── tailwind.config.js        # Tailwind CSS config
├── tsconfig.json             # TypeScript config
└── Dockerfile                # Docker image definition
```

**Tech Stack:**
- React 18: UI library
- Vite: Fast build tool & dev server
- TypeScript: Type safety
- Tailwind CSS: Utility-first styling
- Tailwind CSS: Utility-first styling
- Framer Motion: Smooth animations
- Zustand: Lightweight state management
- React Router: Client-side routing
- Axios: HTTP client
- React Markdown: Render game rules

---

## 🗄️ Database Schema

### Players
```sql
Players who can log in or be referenced in play logs
- id (UUID)
- username, email (unique)
- password (hashed, optional for referenced-only players)
- fullName, avatar
```

### Shelves
```sql
Physical storage containers
- id, name, type (shelf/cupboard/desk/cabinet)
- color, position, shelfCount
- dimensions (width, height, depth)
- description, imageUrl
```

### Games
```sql
Board game inventory
- id, name, maker, releaseYear
- minPlayers, maxPlayers, ageLimit, playTime
- imageUrl, orientation (vertical/horizontal/flat)
- shelfId, position (on shelf)
- tags (many-to-many)
```

### PlayLogs & PlayLogParticipants
```sql
Game session records with participants
- playLogId, gameId, playedAt, duration, notes
- playerId, score, placement (1st, 2nd, etc.)
```

### GameDocuments
```sql
Markdown files for rules, missions, expansions
- id, gameId, title, content (markdown), order
```

### Tags
```sql
Game labels/categories
- id, name (unique), color, icon (emoji)
```

### GlossaryEntries
```sql
Searchable game concepts and terms
- id, term (unique), definition, relatedTerms, imageUrl
```

---

## 🔐 Security Architecture

### Authentication Flow

```
1. User logs in with username/password
   → Backend hashes password check
   → If valid, generate JWT token
   → Return token to frontend

2. Frontend stores token (localStorage or secure httpOnly cookie)
   → Send token in Authorization header for protected requests

3. Backend middleware verifies token
   → If valid, attach user to request
   → If invalid/expired, return 401
```

### Security Measures

✅ **Implemented:**
- Helmet.js for HTTP security headers
- CORS for cross-origin control
- JWT for stateless auth
- Bcryptjs for password hashing
- Zod for input validation
- Prisma for SQL injection prevention
- TypeScript for type safety

🔄 **To Add Later:**
- Rate limiting (express-rate-limit)
- Audit logging for sensitive operations
- File upload security (size, type, storage)
- API key management for third-party integrations

---

## 📡 API Design (RESTful Conventions)

All endpoints return JSON and use standard HTTP methods:

```
GET    /api/resource          → List all
POST   /api/resource          → Create new
GET    /api/resource/:id      → Get one
PUT    /api/resource/:id      → Update
DELETE /api/resource/:id      → Delete

Filters & Pagination
GET    /api/games?shelf=1&search=catan&skip=0&take=20
GET    /api/play-logs?player=alice&game=catan&from=2024-01-01&to=2024-12-31
```

---

## 🎨 Frontend Design Philosophy

### Library Aesthetic

The UI should feel like stepping into a **real library**, not a corporate dashboard:

**Color Palette:**
- `--wood-dark: #2c1810` (Dark wood shelves)
- `--wood-light: #9d8b7e` (Light wood accents)
- `--paper: #f5f1ed` (Parchment background)
- `--gold: #d4af37` (Rich gold text/borders)
- `--text: #1a1a1a` (Deep dark text)

**Components to Build:**
- 📚 **ShelfBrowser**: Visual shelf selector with game thumbnails
- 🎮 **GameCard**: Clickable game with image, details, orientation
- 📋 **PlayLogForm**: Beautiful form to log game sessions
- 📊 **Statistics**: Win rates, most-played games, player rankings
- 🔖 **GlossaryViewer**: Searchable, editable game terms
- 🏷️ **TagFilter**: Colorful tag selection for filtering

**Motion & Interaction:**
- Smooth shelf sliding animations
- Game cards flip on hover
- Floating labels with gold text
- Microinteractions for feedback

---

## 📝 Environment Variables

**Backend (.env)**
```
DATABASE_URL=postgresql://user:password@host:port/database
NODE_ENV=development
PORT=3001
JWT_SECRET=your-secret-key
CORS_ORIGIN=http://localhost:3000
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
```

**Frontend (.env.local)** (Optional, Vite reads automatically)
```
VITE_API_URL=http://localhost:3001
VITE_API_BASE=/api
```

---

## 🧪 Testing & Validation

**Type checking:**
```bash
cd backend && npm run type-check
cd frontend && npm run type-check
```

**Linting:**
```bash
npm run lint  # in either directory
```

**Running the app:**
```bash
docker-compose up          # Full stack with Docker
npm run dev                # Individual dev servers
```

---

## 📦 Deployment Checklist

- [ ] Set strong `JWT_SECRET` in production
- [ ] Configure PostgreSQL credentials
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS/SSL
- [ ] Add rate limiting
- [ ] Setup backup strategy for PostgreSQL
- [ ] Configure reverse proxy (nginx/caddy)
- [ ] Add monitoring/logging
- [ ] Test security headers with https://securityheaders.com/

---

## 🔄 Next Steps

1. **Install dependencies** (locally or via Docker)
2. **Setup database** with `npx prisma migrate dev`
3. **Build auth endpoints** (login, register, verify token)
4. **Create shelf management** API and UI
5. **Build game inventory** CRUD operations
6. **Implement play log tracking** with complex queries
7. **Design beautiful library UI** with animations
8. **Add glossary & tags** search and editing
9. **Create analytics dashboard** for play statistics
10. **Deploy to home server** with Docker

---

## 🛠️ Common Commands

```bash
# Backend
npm run dev              # Start dev server with hot reload
npm run build            # Compile TypeScript
npm run type-check       # Check types without building
npx prisma studio       # Visual database editor
npx prisma migrate dev   # Run migrations
npx prisma db push      # Push schema changes

# Frontend
npm run dev              # Start Vite dev server
npm run build            # Build for production
npm run preview          # Preview production build

# Docker
docker-compose up        # Start all services
docker-compose down      # Stop all services
docker-compose logs -f   # View logs
```

---

## 📖 Resources

- [Express.js Docs](https://expressjs.com/)
- [Prisma Docs](https://www.prisma.io/docs/)
- [React Docs](https://react.dev/)
- [Tailwind CSS Docs](https://tailwindcss.com/docs/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)

---

**Ready to build something magical! 🪄✨**
