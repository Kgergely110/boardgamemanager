# 🎮 Getting Started with Board Game Manager

## 1️⃣ Initial Setup (5 minutes)

### Prerequisites
- Node.js 18+ installed (or Docker)
- npm or yarn
- Git

### Clone/Navigate to Project
```bash
cd /Users/gergo/dev/boardgamemanager
```

## 2️⃣ Choose Your Setup Path

### Path A: Docker (Recommended - 1 command!)

```bash
# Set the required signing secret once
cp .env.example .env
# Replace the placeholder with the output of: openssl rand -hex 32

# Start the entire stack
docker compose up --build
# Wait for all services to start (2-3 minutes first time)
# You'll see: "🎲 Board Game Manager API running on http://localhost:3001"
```

Access:
- 🌐 Frontend: http://localhost:3000
- 📡 API: http://localhost:3001/health
- 🗄️ Database: localhost:5432

The database migrations run automatically on backend startup. On first visit,
create the administrator account; the setup screen is disabled after that.

---

### Path B: Manual Setup (If Docker isn't available)

#### Backend Setup
```bash
cd backend

# Install dependencies
npm install

# Setup PostgreSQL
# Option 1: Run PostgreSQL locally (requires installation)
# Option 2: Use Docker just for the database:
docker run --name bgm-postgres \
  -e POSTGRES_PASSWORD=bgm_password \
  -e POSTGRES_USER=bgm_user \
  -e POSTGRES_DB=boardgamemanager \
  -p 5432:5432 \
  postgres:16-alpine

# Copy environment file
cp .env.example .env
# Edit .env if needed (defaults should work)

# Run database migrations
npx prisma migrate dev --name init
# This creates tables in PostgreSQL

# Start the development server
npm run dev
# Server runs on http://localhost:3001
```

#### Frontend Setup (new terminal window)
```bash
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
# App runs on http://localhost:3000
```

---

## 3️⃣ Verify Everything Works

### Check Backend Health
```bash
curl http://localhost:3001/health

# Expected response:
# {"status":"ok","timestamp":"2024-11-17T..."}
```

### Check Frontend
Open http://localhost:3000 in your browser
- You should see "Board Game Library" title
- Simple placeholder page is working

### Check Database (Prisma Studio)
```bash
cd backend
npx prisma studio

# Opens http://localhost:5555 in your browser
# Shows all database tables (empty for now)
```

---

## 4️⃣ Create Sample Data (Optional)

### Using Prisma Studio (GUI)
```bash
npx prisma studio
# Click "Create" on each table to add sample data
```

### Using TypeScript Script
Create `backend/src/seed.ts`:
```typescript
import prisma from "@/lib/prisma";

async function main() {
  // Create a shelf
  const shelf = await prisma.shelf.create({
    data: {
      name: "Main Bookcase",
      type: "shelf",
      color: "#8B4513",
      position: 1,
      shelfCount: 4,
    },
  });

  // Create a tag
  const tag = await prisma.tag.create({
    data: {
      name: "Strategy",
      color: "#FF6B6B",
      icon: "♟️",
    },
  });

  // Create a game
  const game = await prisma.game.create({
    data: {
      name: "Catan",
      maker: "Klaus Teuber",
      releaseYear: 1995,
      minPlayers: 2,
      maxPlayers: 4,
      ageLimit: 10,
      playTime: 60,
      shelfId: shelf.id,
      position: 1,
      tags: {
        connect: { id: tag.id },
      },
    },
  });

  console.log("Sample data created:", { shelf, game, tag });
}

main().then(() => {
  console.log("Done!");
  process.exit(0);
});
```

Then run:
```bash
npx tsx src/seed.ts
```

---

## 5️⃣ Project Layout (Quick Reference)

```
boardgamemanager/
├── backend/              # REST API
│   ├── src/
│   │   ├── index.ts      # Server entry
│   │   ├── lib/          # Utilities
│   │   ├── middlewares/  # Auth middleware
│   │   ├── routes/       # API endpoints (to build)
│   │   ├── services/     # Business logic (to build)
│   │   └── types/        # TypeScript types (to build)
│   └── prisma/
│       └── schema.prisma # Database definition
│
├── frontend/             # React UI
│   ├── src/
│   │   ├── App.tsx       # Main component
│   │   ├── components/   # UI components (to build)
│   │   ├── pages/        # Page views (to build)
│   │   └── stores/       # Zustand state (to build)
│   └── index.html        # HTML entry
│
├── docker-compose.yml    # Docker setup
├── README.md             # Project overview
├── SETUP.md              # Detailed setup guide
├── ARCHITECTURE.md       # System design
└── GETTING_STARTED.md    # This file!
```

---

## 6️⃣ What to Build Next

### Recommended First Feature: Authentication

1. **Create auth routes** (`backend/src/routes/auth.ts`)
   - POST /api/auth/register
   - POST /api/auth/login

2. **Create auth service** (`backend/src/services/authService.ts`)
   - Hash password with bcryptjs
   - Generate JWT token
   - Verify credentials

3. **Create auth UI** (`frontend/src/pages/Login.tsx`)
   - Login form
   - Input validation
   - Token storage in Zustand

4. **Test it!**
   - Register a new user
   - Log in
   - Try accessing protected endpoints

### After Auth: Shelf & Game Management

Build the core CRUD operations:
- List shelves from database
- Display games on selected shelf
- Add/edit/delete games
- Upload game images

### Then: Play Log System

This is where the app gets fun:
- Record who played which game
- Track scores and placements
- View game session history

### Finally: Beautiful UI

Design the library aesthetic:
- Shelf browser component
- Game card animations
- Glossary viewer
- Statistics dashboard

---

## 7️⃣ Common Commands

### Backend
```bash
cd backend

npm run dev              # Start dev server with hot reload
npm run build           # Compile TypeScript
npm run type-check      # Check types
npm run lint            # Lint code
npx prisma studio      # Open database GUI
npx prisma migrate dev # Run migrations
npx prisma db push     # Apply schema changes
npx prisma reset       # Wipe and recreate database
```

### Frontend
```bash
cd frontend

npm run dev             # Start Vite dev server
npm run build           # Build for production
npm run preview         # Preview production build
npm run lint            # Lint code
npm run type-check      # Check types
```

### Docker
```bash
docker-compose up       # Start all services
docker-compose down     # Stop all services
docker-compose logs -f  # View logs (live)
docker-compose restart  # Restart services
docker-compose ps       # List running services
```

---

## 8️⃣ Debugging Tips

### "Cannot connect to database"
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check database connection
psql -h localhost -U bgm_user -d boardgamemanager

# Verify .env DATABASE_URL
cat backend/.env
```

### "Port 3000 or 3001 already in use"
```bash
# Find what's using the port
lsof -i :3000
lsof -i :3001

# Kill the process
kill -9 <PID>
```

### TypeScript errors but code works
```bash
# Clear TypeScript cache
rm -rf backend/dist frontend/dist

# Run type check
npm run type-check
```

### Database migrations failed
```bash
# Reset database (⚠️ deletes all data)
npx prisma migrate reset

# Or manually check schema
npx prisma studio
```

---

## 9️⃣ Useful Resources

📖 **In This Project:**
- [README.md](README.md) - Project overview
- [SETUP.md](SETUP.md) - Detailed setup & architecture
- [ARCHITECTURE.md](ARCHITECTURE.md) - System design deep-dive
- [backend/prisma/schema.prisma](backend/prisma/schema.prisma) - Database schema

📚 **External Docs:**
- [Express.js](https://expressjs.com/)
- [Prisma](https://www.prisma.io/docs/)
- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/docs/)
- [Tailwind CSS](https://tailwindcss.com/docs/)
- [Docker](https://docs.docker.com/)

🎯 **API Testing:**
- Postman (https://www.postman.com/)
- Insomnia (https://insomnia.rest/)
- cURL (command line)

---

## 🔟 Next Steps

1. **✅ Project is scaffolded** - You are here!
2. **⏳ Get it running** - Try docker-compose up
3. **⏳ Build auth system** - Login/register users
4. **⏳ Create shelf manager** - Display game shelves
5. **⏳ Build game inventory** - CRUD games
6. **⏳ Add play logs** - Track game sessions
7. **⏳ Design UI** - Make it beautiful
8. **⏳ Deploy** - Put it on your home server

---

## ❓ Getting Help

If something doesn't work:

1. Check the [SETUP.md](SETUP.md) file
2. Check error messages carefully
3. Try the debugging tips above
4. Check [ARCHITECTURE.md](ARCHITECTURE.md) for system overview
5. Review the TypeScript types for hints
6. Check the database schema in Prisma Studio

---

## 🎉 You're Ready!

Your Board Game Manager is ready for development. The scaffolding is complete, the architecture is solid, and the foundation is secure.

**Next command:**
```bash
docker-compose up
# or
cd backend && npm run dev
cd frontend && npm run dev
```

**Happy building!** 🪄✨

