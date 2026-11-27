import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import "express-async-errors";
import dotenv from "dotenv";
import { resolve } from "node:path";
import { assertJwtConfiguration } from "./lib/auth.js";
import { sendApiError } from "./lib/http.js";
import { openApiDocument } from "./openapi.js";
import { authenticateToken } from "./middlewares/auth.js";
import authRoutes from "./routes/auth.js";
import developmentRoutes from "./routes/development.js";
import shelfRoutes from "./routes/shelves.js";
import gameRoutes from "./routes/games.js";
import gameDocumentRoutes from "./routes/gameDocuments.js";
import gameTagRoutes from "./routes/gameTags.js";
import gameImageRoutes from "./routes/gameImages.js";
import gameFeedbackRoutes from "./routes/gameFeedback.js";
import tagRoutes from "./routes/tags.js";
import playerRoutes from "./routes/players.js";
import playLogRoutes from "./routes/playLogs.js";
import ongoingGameRoutes from "./routes/ongoingGames.js";
import gameNightRoutes from "./routes/gameNights.js";
import wikiRoutes from "./routes/wiki.js";
import ambienceRoutes from "./routes/ambience.js";
import wishlistRoutes from "./routes/wishlist.js";
import prisma from "./lib/prisma.js";

dotenv.config();
assertJwtConfiguration();

const app: Express = express();
const PORT = process.env.PORT || 3001;
const uploadDirectory = resolve(process.env.UPLOAD_DIR || "./uploads");

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  "/uploads",
  express.static(uploadDirectory, {
    dotfiles: "deny",
    index: false,
  }),
);

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/openapi.json", (_req: Request, res: Response) => {
  res.json(openApiDocument);
});
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

app.use("/api/auth", authRoutes);
if (process.env.NODE_ENV !== "production") {
  app.use("/api/dev", developmentRoutes);
}
app.use("/api/shelves", authenticateToken, shelfRoutes);
app.use("/api/games", authenticateToken, gameRoutes);
app.use("/api/games", authenticateToken, gameDocumentRoutes);
app.use("/api/games", authenticateToken, gameTagRoutes);
app.use("/api/games", authenticateToken, gameImageRoutes);
app.use("/api/games", authenticateToken, gameFeedbackRoutes);
app.use("/api/tags", authenticateToken, tagRoutes);
app.use("/api/players", authenticateToken, playerRoutes);
app.use("/api/play-logs", authenticateToken, playLogRoutes);
app.use("/api/game-nights", authenticateToken, gameNightRoutes);
app.use("/api/ongoing-games", authenticateToken, ongoingGameRoutes);
app.use("/api/wiki", authenticateToken, wikiRoutes);
app.use("/api/ambience", authenticateToken, ambienceRoutes);
app.use("/api/wishlist", authenticateToken, wishlistRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  sendApiError(res, 404, "Not found");
});

// Global error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  const status =
    typeof err === "object" && err !== null && "status" in err &&
    typeof err.status === "number"
      ? err.status
      : 500;
  sendApiError(
    res,
    status,
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err instanceof Error
        ? err.message
        : "Unexpected error",
  );
});

const server = app.listen(PORT, () => {
  console.log(`🎲 Board Game Manager API running on http://localhost:${PORT}`);
  console.log(`📚 Environment: ${process.env.NODE_ENV}`);
});

const shutdown = async () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export default app;
