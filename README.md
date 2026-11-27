# Board Game Manager - Full Stack Application

A beautiful, immersive web application for managing board game inventory with a library-inspired aesthetic.

## Project Structure

```
boardgamemanager/
├── backend/              # Express.js REST API
│   ├── src/
│   │   ├── index.ts      # Main server entry
│   │   ├── lib/          # Utilities (auth, prisma)
│   │   ├── middlewares/  # Auth, error handling
│   │   ├── routes/       # API endpoints
│   │   ├── services/     # Business logic
│   │   ├── types/        # TypeScript types
│   │   └── utils/        # Helper functions
│   ├── prisma/           # Database schema
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── frontend/             # React + Tailwind UI
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Page components
│   │   ├── stores/       # Zustand state management
│   │   ├── hooks/        # Custom React hooks
│   │   ├── types/        # TypeScript interfaces
│   │   ├── utils/        # Helpers
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── Dockerfile
├── docker-compose.yml    # Local development environment
└── README.md
```

## Tech Stack

- **Backend**: Node.js, Express.js, TypeScript, Prisma ORM
- **Database**: PostgreSQL (can switch to SQLite for simpler setup)
- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite
- **Styling**: Custom CSS with library aesthetic (wood, gold, parchment themes)
- **State Management**: Zustand
- **Authentication**: JWT tokens
- **Deployment**: Docker & Docker Compose

## Getting Started

### Prerequisites

- Node.js 18+ or Docker
- npm/yarn

### Local Development (without Docker)

```bash
# Backend setup
cd backend
npm install
cp .env.example .env
# Update DATABASE_URL in .env to your local PostgreSQL
npx prisma migrate dev
npm run dev

# Frontend setup (in another terminal)
cd frontend
npm install
npm run dev
```

### Local Development (with Docker)

```bash
cp .env.example .env
# Replace JWT_SECRET with: openssl rand -hex 32
docker compose up --build
```

The app will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- PostgreSQL: localhost:5432

The backend applies pending migrations and regenerates Prisma Client before
starting the API. Manual `npm run dev` starts also regenerate Prisma Client
from the current schema.

The Docker workflow builds separate development images for `backend` and
`frontend`. On pushes to `main` and version tags, it publishes them to
`ghcr.io/kgergely110/boardgamemanager/backend` and
`ghcr.io/kgergely110/boardgamemanager/frontend`, respectively.

## Database Schema Highlights

### Core Models

- **Shelves**: Physical storage locations (shelf, cupboard, desk), with separate colors for the shelf planks and cabinet frame
- **Games**: Board game inventory with metadata, images, documents
- **Players**: User accounts + player references
- **PlayLogs**: Game session records with participants, scores, duration
- **GuestGames**: Persisted game names for sessions played outside the library
- **Tags**: Game labels (RPG, Family, Casual, Party, etc.)
- **GameDocuments**: Markdown rules, missions, expansions
- **GameRatings & GameAwards**: Per-user reviews, game characteristics, and award history
- **WikiEntries**: Searchable Markdown concepts, strategies, and game types
- **AmbienceSets & AmbienceLinks**: Reusable music/visual link collections associated with games and tags
- **WishlistItems & WishlistInterests**: Shared household wishlist with tags, priority, acquisition details, and per-player interest

## Implemented API Endpoints

```
Auth
  GET    /api/auth/status
  POST   /api/auth/setup (one-time initial account)
  POST   /api/auth/login
  POST   /api/dev/users (non-production only; administrator only)
  GET    /api/auth/me

Players
  GET    /api/players (app accounts available in play logs)

Shelves / containers
  GET    /api/shelves
  POST   /api/shelves
  GET    /api/shelves/:id
  PATCH  /api/shelves/:id
  DELETE /api/shelves/:id (empty containers only)

Games
  GET    /api/games
  GET    /api/games/deleted-matches?name=:title
  POST   /api/games/restore
  PUT    /api/games/arrangement
  GET    /api/games/:id
  POST   /api/games
  PATCH  /api/games/:id
  DELETE /api/games/:id (soft-archives the game and retains related data)
  POST   /api/games/:id/image
  POST   /api/games/:id/documents
  PATCH  /api/games/:id/documents/:documentId
  DELETE /api/games/:id/documents/:documentId

Game reviews and awards (all routes require authentication)
  GET    /api/games/:id/reviews
  PUT    /api/games/:id/ratings/me (one rating per app user and game)
  DELETE /api/games/:id/ratings/me
  POST   /api/games/:id/awards
  DELETE /api/games/:id/awards/:awardId

Play logs (all routes require authentication)
  GET    /api/play-logs/guest-games (searchable, 30 per page)
  GET    /api/play-logs (100 per page; filter by library/guest game, tag, winner, date, place, playtime)
  POST   /api/play-logs
  PUT    /api/play-logs/:id
  DELETE /api/play-logs/:id

Ongoing games (all routes require authentication)
  GET    /api/ongoing-games
  POST   /api/ongoing-games (start a timed game with players and optional location)
  GET    /api/ongoing-games/:id
  POST   /api/ongoing-games/:id/pause
  POST   /api/ongoing-games/:id/resume
  POST   /api/ongoing-games/:id/finish (creates a play log)

Wiki (all routes require authentication)
  GET    /api/wiki (search categories, Markdown entries, tags, and example games)
  POST   /api/wiki/categories
  PATCH  /api/wiki/categories/:id
  DELETE /api/wiki/categories/:id (only when empty)
  POST   /api/wiki/entries
  PATCH  /api/wiki/entries/:id
  DELETE /api/wiki/entries/:id

Game ambience (all routes require authentication)
  GET    /api/ambience
  GET    /api/ambience/for-game/:gameId (direct game links plus matching tag setups)
  POST   /api/ambience
  PATCH  /api/ambience/:id
  DELETE /api/ambience/:id

Shared wishlist (all routes require authentication)
  GET    /api/wishlist (search, tag/player/time/age/price filters, sorting, pagination)
  POST   /api/wishlist
  PATCH  /api/wishlist/:id
  DELETE /api/wishlist/:id (archived items not linked to collection games only)
  PUT    /api/wishlist/:id/interests/me
  DELETE /api/wishlist/:id/interests/me
```

Container and game management, physical game placement/orientation, image URLs
and uploads, search spotlights, and individual game dossiers are available in
the authenticated library UI. Six visual themes are saved per browser in
local storage, and container navigation is nested under All games. The interface
uses bundled Literata and DM Sans fonts with Latin Extended character support.
Each dossier includes an editable, required Rules
document and supports additional Markdown documents with a live preview. The
Rules document is created for new games and migrated from existing rules text;
it cannot be renamed or deleted. Game dossiers also provide one rating per app
user, an overall average, optional characteristic scores and comments, and a
shared list of game awards. The game log records library games or persisted
guest-game names, app users or guest players, optional playtime/place/scores,
and flexible tied placements. First place drives winner filters and statistics
without forcing games into a winner/loser format.
The Let’s Play page can draw a random library game, draw from games matching
selected tags, player count, and maximum playtime, or let the user choose a
library or guest game explicitly. Making a selection does not create a play log.
The management page provides 100-record pagination, filtered session statistics,
and charts for frequently played games and first-place finishes. The wiki
organizes searchable Markdown entries under editable categories and can link
game tags and example titles. In
non-production environments, administrators can create non-admin login accounts;
the frontend menu is omitted from production builds and the API route is not
mounted when `NODE_ENV=production`. A dedicated player-management interface and
production deployment hardening remain planned.

Timed games are saved as ongoing sessions when started. Their start time, players,
location, and accumulated pauses survive navigation and server restarts. Pausing
and resuming update the database immediately; finishing creates a play log with
the measured active duration and removes the session from the ongoing list.
Ambience setups collect external music and visual links and can be shared across
games and tags. Matching setups appear during an ongoing library game; links open
in a new tab or associated app, while the library itself does not play or host media.
The shared wishlist records candidate games, household interest, tags, priority,
status, and optional cost/source details. Acquiring a wishlist game through the
library creation flow transfers its tags and links the new collection entry in
the same database transaction.

Deleting a game archives it without removing its play logs, documents, tags,
or uploaded cover. Creating another game with the same title offers to restore
an archived copy and its associated history. In the library, **Arrange games**
enables drag-and-drop ordering and stacking within each shelf level; selecting
a game also exposes orientation and stack-target controls, with arrow controls
for reliable reordering. Changes are persisted as they are made.

## Security Features

- ✅ Helmet for HTTP headers security
- ✅ CORS configuration
- ✅ JWT authentication
- ✅ Password hashing with bcryptjs
- ✅ Input validation with Zod
- ✅ SQL injection prevention (Prisma)
- ⏳ Rate limiting
- ⏳ Audit logging (to be added)

## Next Steps

1. ✅ Project scaffolding
2. ✅ Database migrations and authenticated first-run setup
3. ✅ Container and game inventory management
4. ✅ Library browsing and catalog search
5. ✅ Play log management & statistics
6. ⏳ Player management
7. ⏳ Production deployment hardening

---

**Status**: The authenticated inventory library, searchable game wiki, and
play-log manager are running; player management and production hardening remain
next.
