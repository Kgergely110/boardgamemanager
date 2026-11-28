# Board Game Manager

A self-hosted board-game library for organizing games, their physical locations, players, game nights, play history, and reference material. The interface is designed as a browsable library, with shelves and containers as the organizing metaphor.

## Features

- **Library and storage:** Browse and search games; organize shelves, cupboards, desks, and other storage containers; record shelf number, position, and orientation; arrange games visually; and locate a game from its details.
- **Game records:** Store a game's name, publisher, release year, player range, minimum age, play time, description, cover image, and tags. Images can be uploaded or linked by URL.
- **Documents and tags:** Keep Markdown rules and other game documents, including mission or scenario material. Create reusable tags and associate them with games.
- **Players and feedback:** Maintain registered player accounts as well as guest names for play logs. Players can rate games; the library can also record game awards.
- **Play history and insights:** Create, edit, filter, and delete play logs. Record participants, scores and placements, duration, date, and location. Explore play frequency and results by game, tag, player, and time period; tied results are treated fairly in the insights.
- **Game nights:** Group logs into a game night, view a recap and standings, and download a one-page PDF certificate for the winning player when the night is closed.
- **Ongoing games:** Track a game in progress, pause or resume its timer, and finish it by creating a play log.
- **Collection pulse:** See recent collection activity, including games added and played.
- **Glossary:** Create and search categories and Markdown entries describing game concepts and types.
- **Shared wishlist:** Add and filter games people are considering, update their status and details, and let registered players record interest.
- **Ambience:** Save ambience setups for the library or specific games, including Spotify embed links.
- **Interface:** A responsive, library-inspired UI with selectable visual themes, including a high-contrast accessibility theme, dismissible feedback, and recoverable error screens. Pages can continue to render when an unrelated API-backed section fails.

## Technology

| Area | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, React Router, Axios |
| UI | Custom CSS, Framer Motion, Lucide icons, React Markdown, system sans-serif and Georgia |
| PDF certificate | jsPDF |
| Backend | Node.js 20, Express 4, TypeScript |
| Data and validation | PostgreSQL 16, Prisma 5, Zod |
| API documentation | OpenAPI generated from the backend schemas, Swagger UI |
| Authentication | bcryptjs password hashes and signed JWT bearer tokens |
| Local development | Docker Compose |

The frontend is a single-page application. It calls the backend using the same-origin `/api` path. The backend persists structured data in PostgreSQL and uploaded game images in the filesystem.

## Requirements

- Docker and Docker Compose for the containerized development setup; or
- Node.js 20+, npm, and PostgreSQL 16 for running the frontend and backend directly.

## Run with Docker Compose

From the repository root:

1. Create the root environment file and set a random JWT secret of at least 32 characters:

   ```sh
   cp .env.example .env
   openssl rand -hex 32
   ```

   Put the generated value in `.env` as `JWT_SECRET`.

2. Build and start the services:

   ```sh
   docker compose up --build
   ```

3. Open `http://localhost:3000`. To use the app from another device on the home network, open `http://<server-ip>:3000`.

Compose starts PostgreSQL, the backend in development/watch mode, and the Vite frontend development server. The backend applies Prisma migrations when it starts.

The Compose setup uses development database credentials and exposes PostgreSQL on port `5432`; it is not a production-hardened deployment. The named database volume and uploaded-image directory persist when containers stop. `docker compose down` stops the services without removing the database volume. `docker compose down -v` removes the volume and permanently deletes its database contents.

## Run locally

Start a PostgreSQL 16 database and make it available on `localhost:5432`. The sample backend database URL expects the database and user `boardgamemanager` and `bgm_user`, with password `bgm_password`; adjust it to match your local database.

Start the backend:

```sh
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev
```

In another terminal, start the frontend:

```sh
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. Vite proxies `/api` and `/uploads` requests to the backend on port `3001`.

On the first visit, use the setup screen to create the initial administrator account. Once that account exists, initial setup is closed.

## Configuration

The containerized setup reads `JWT_SECRET` from the root `.env`. Direct backend development uses `backend/.env`; see [`backend/.env.example`](backend/.env.example) for the sample values.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | Backend HTTP port; defaults to `3001` |
| `NODE_ENV` | Runtime environment; Compose uses `development` |
| `JWT_SECRET` | JWT signing secret; must be at least 32 characters |
| `UPLOAD_DIR` | Directory for uploaded game images; defaults to `./uploads` |
| `CORS_ORIGIN` | Allowed browser origin; defaults to `http://localhost:3000` |

The image upload endpoint currently accepts JPEG, PNG, and WebP files up to 8 MiB. The Compose setup mounts the backend uploads directory so uploaded files survive container recreation. Keep both the database and uploads in backups.

## API

The API base path is `/api`. Interactive documentation is served at [`/api/docs`](http://localhost:3001/api/docs), and the generated OpenAPI JSON is at [`/api/openapi.json`](http://localhost:3001/api/openapi.json). The generated specification is the source of truth for request and response schemas, query parameters, and endpoint-specific error responses.

Resource routes require a bearer token. `GET /health`, `GET /api/auth/status`, `POST /api/auth/setup`, and `POST /api/auth/login` are public. Swagger UI and the OpenAPI JSON are also available without signing in. The development account-creation endpoint is administrator-only and is not mounted in production.

`{id}`, `{gameId}`, `{documentId}`, `{tagId}`, and `{awardId}` are path parameters.

### Health and authentication

| Method | Path | Purpose | Access |
| --- | --- | --- | --- |
| `GET` | `/health` | API health check | Public |
| `GET` | `/api/auth/status` | Check whether initial setup is required | Public |
| `POST` | `/api/auth/setup` | Create the first administrator | Public, setup only |
| `POST` | `/api/auth/login` | Sign in and receive a bearer token | Public |
| `GET` | `/api/auth/me` | Get the authenticated player | Signed in |
| `POST` | `/api/dev/users` | Create a player account during development | Administrator; not mounted in production |

### Shelves, games, documents, tags, and feedback

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/shelves` | List storage containers |
| `POST` | `/api/shelves` | Create a storage container |
| `PATCH` | `/api/shelves/{id}` | Update a storage container |
| `DELETE` | `/api/shelves/{id}` | Delete an empty storage container |
| `GET` | `/api/games` | List or search library games; supports query filters |
| `GET` | `/api/games/collection-pulse` | Recent collection activity |
| `POST` | `/api/games` | Add a game |
| `GET` | `/api/games/deleted-matches` | Find archived games by name |
| `POST` | `/api/games/restore` | Restore an archived game |
| `PUT` | `/api/games/arrangement` | Save the shelf arrangement |
| `GET` | `/api/games/{id}` | Get a game and its documents |
| `PATCH` | `/api/games/{id}` | Update a game |
| `DELETE` | `/api/games/{id}` | Archive a game |
| `POST` | `/api/games/{id}/image` | Upload a game image (`multipart/form-data`, field `image`) |
| `POST` | `/api/games/{id}/documents` | Add a Markdown game document |
| `PATCH` | `/api/games/{id}/documents/{documentId}` | Update a game document |
| `DELETE` | `/api/games/{id}/documents/{documentId}` | Delete a game document |
| `POST` | `/api/games/{id}/tags` | Assign a tag to a game |
| `DELETE` | `/api/games/{id}/tags/{tagId}` | Remove a tag from a game |
| `GET` | `/api/tags` | List tags used by library games |
| `POST` | `/api/tags` | Create a tag |
| `GET` | `/api/players` | List registered players |
| `GET` | `/api/games/{gameId}/reviews` | Get ratings and awards for a game |
| `PUT` | `/api/games/{gameId}/ratings/me` | Create or update the current player's rating |
| `DELETE` | `/api/games/{gameId}/ratings/me` | Delete the current player's rating |
| `POST` | `/api/games/{gameId}/awards` | Record an award for a game |
| `DELETE` | `/api/games/{gameId}/awards/{awardId}` | Delete a game award |

### Play logs, game nights, and ongoing games

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/play-logs` | List play logs and filtered statistics; paginated in 100-item pages |
| `POST` | `/api/play-logs` | Create a play log |
| `PUT` | `/api/play-logs/{id}` | Replace a play log |
| `DELETE` | `/api/play-logs/{id}` | Delete a play log |
| `GET` | `/api/play-logs/guest-games` | Search guest games used in play logs |
| `GET` | `/api/game-nights` | List recent game nights |
| `POST` | `/api/game-nights` | Start a game night |
| `GET` | `/api/game-nights/{id}` | Get a game-night recap |
| `POST` | `/api/game-nights/{id}/close` | Close a game night |
| `GET` | `/api/ongoing-games` | List games currently in progress |
| `POST` | `/api/ongoing-games` | Start an ongoing game |
| `GET` | `/api/ongoing-games/{id}` | Get an ongoing game |
| `POST` | `/api/ongoing-games/{id}/pause` | Pause an ongoing game |
| `POST` | `/api/ongoing-games/{id}/resume` | Resume an ongoing game |
| `POST` | `/api/ongoing-games/{id}/finish` | Finish a game and create its play log |

### Glossary, ambience, and wishlist

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/wiki` | Search glossary entries and categories |
| `POST` | `/api/wiki/categories` | Create a glossary category |
| `PATCH` | `/api/wiki/categories/{id}` | Update a glossary category |
| `DELETE` | `/api/wiki/categories/{id}` | Delete an empty glossary category |
| `POST` | `/api/wiki/entries` | Create a glossary entry |
| `PATCH` | `/api/wiki/entries/{id}` | Update a glossary entry |
| `DELETE` | `/api/wiki/entries/{id}` | Delete a glossary entry |
| `GET` | `/api/ambience` | List ambience setups |
| `GET` | `/api/ambience/for-game/{gameId}` | Find ambience setups for a game |
| `POST` | `/api/ambience` | Create an ambience setup |
| `PATCH` | `/api/ambience/{id}` | Update an ambience setup |
| `DELETE` | `/api/ambience/{id}` | Delete an ambience setup |
| `GET` | `/api/wishlist` | List and filter wishlist items |
| `POST` | `/api/wishlist` | Add a game to the wishlist |
| `PATCH` | `/api/wishlist/{id}` | Update a wishlist item |
| `DELETE` | `/api/wishlist/{id}` | Permanently remove an archived wishlist item |
| `PUT` | `/api/wishlist/{id}/interests/me` | Register the current player's interest |
| `DELETE` | `/api/wishlist/{id}/interests/me` | Remove the current player's interest |

### Response conventions

- Successful JSON responses generally use a `{ "data": ... }` envelope. List endpoints that paginate include pagination metadata.
- Successful deletes that return `204 No Content` have no response body.
- Errors use `{ "error": "...", "code": "...", "details": ... }`; `details` is included when applicable.
- Common status codes include `400` for invalid input, `401` for missing or invalid authentication, `403` for insufficient permissions, `404` for missing resources, `409` for conflicts, `413` for oversized uploads, `422` for invalid operations, and `500` for unexpected server errors.

## Data and persistence

PostgreSQL stores user accounts, storage containers, games, tags, documents, game ratings and awards, play logs and participants, game nights, ongoing games, glossary categories and entries, ambience setups, wishlist items and interests, and archived-game records. Uploaded images are stored on disk and referenced by the game record; they are not stored in PostgreSQL.

Prisma schema and migrations are in [`backend/prisma/`](backend/prisma/). To apply existing migrations to a database:

```sh
cd backend
npx prisma migrate deploy
```

For local schema development, use `npx prisma migrate dev`. `npx prisma studio` opens Prisma Studio for inspecting the database.

## Authentication and security behavior

<<<<<<< HEAD
The Docker workflow builds separate development images for `backend` and
`frontend`. On pushes to `main` and version tags, it publishes them to
`ghcr.io/kgergely110/boardgamemanager/backend` and
`ghcr.io/kgergely110/boardgamemanager/frontend`, respectively.

## Database Schema Highlights
=======
- Passwords are hashed with bcrypt; login returns a signed JWT bearer token that expires after seven days.
- The first administrator is created through the setup flow. Setup closes after that account exists.
- Normal API access requires `Authorization: Bearer <token>`. Registered players are accounts; play-log participants may also be unregistered guest names.
- The backend validates request data with Zod, sets security headers with Helmet, applies configured CORS, limits JSON request bodies to 1 MiB, and validates uploaded image type and content.
- Uploaded images are served from `/uploads`; the upload directory is controlled by `UPLOAD_DIR`.
- The development-only `/api/dev/users` route is not mounted when `NODE_ENV=production`.
>>>>>>> 1da4cdf (refactor components and error handling)

The supplied Compose configuration is for development: it uses the development servers and sample PostgreSQL credentials, and it does not provide TLS termination or a production reverse proxy. Do not expose it directly to the public internet. For a production deployment, use production database credentials and a strong `JWT_SECRET`, run migrations before starting the API, and serve the frontend and API through a trusted same-origin HTTPS reverse proxy. The frontend expects `/api` and `/uploads` to be routed to the backend.

## Build, test, and lint

Backend commands (run from `backend/`):

```sh
npm run build
npm start
npm run lint
npm run type-check
npm test
```

Frontend commands (run from `frontend/`):

```sh
npm run build
npm run preview
npm run lint
npm run type-check
```

The frontend production build is written to `frontend/dist/`. The repository's Docker Compose and Dockerfiles are configured for local development rather than serving that production build.
