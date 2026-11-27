import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  RouteConfig,
} from "@asteasolutions/zod-to-openapi";
import { z, ZodTypeAny } from "zod";
import { credentialsSchema, setupSchema } from "./routes/auth.js";
import { userSchema } from "./routes/development.js";
import {
  createShelfSchema,
  updateShelfSchema,
} from "./routes/shelves.js";
import { createTagSchema } from "./routes/tags.js";
import {
  arrangementSchema,
  createDocumentSchema,
  createGameSchema,
  deletedMatchQuerySchema,
  gameIdSchema,
  gameListQuerySchema,
  restoreGameSchema,
  tagAssociationSchema,
  updateDocumentSchema,
  updateGameSchema,
} from "./routes/games.js";
import { awardSchema, ratingSchema } from "./routes/gameFeedback.js";
import {
  guestGameListQuerySchema,
  listQuerySchema as playLogListQuerySchema,
  playLogSchema,
} from "./routes/playLogs.js";
import {
  finishSchema,
  idSchema as ongoingGameIdSchema,
  startSchema,
} from "./routes/ongoingGames.js";
import {
  categorySchema,
  createEntrySchema,
  idSchema as wikiIdSchema,
  searchSchema as wikiSearchQuerySchema,
  updateCategorySchema,
  updateEntrySchema,
} from "./routes/wiki.js";
import { ambienceSetSchema, idSchema as ambienceIdSchema } from "./routes/ambience.js";
import {
  createSchema as createWishlistItemSchema,
  idSchema as wishlistIdSchema,
  listQuerySchema as wishlistListQuerySchema,
  updateSchema as updateWishlistItemSchema,
} from "./routes/wishlist.js";
import { idSchema as gameNightIdSchema } from "./routes/gameNights.js";
import { idSchema as feedbackGameIdSchema } from "./routes/gameFeedback.js";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();
const apiErrorSchema = registry.register(
  "ApiError",
  z.object({
    error: z.string(),
    code: z.string().optional(),
    details: z.record(z.array(z.string())).optional(),
  }).passthrough(),
);
const jsonResponseSchema = registry.register("JsonResponse", z.object({}).passthrough());
const uuid = z.string().uuid();
const idParams = z.object({ id: uuid });
const gameIdParams = z.object({ gameId: gameIdSchema });
const documentParams = z.object({ id: gameIdSchema, documentId: uuid });
const gameTagParams = z.object({ id: gameIdSchema, tagId: uuid });
const awardParams = z.object({ gameId: feedbackGameIdSchema, awardId: uuid });
const interestParams = z.object({ id: wishlistIdSchema });

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";
type SuccessStatus = 200 | 201 | 204;
type RouteRequest = NonNullable<RouteConfig["request"]>;

interface RouteDefinition {
  method: HttpMethod;
  path: string;
  tag: string;
  summary: string;
  success: SuccessStatus;
  params?: RouteRequest["params"];
  query?: RouteRequest["query"];
  body?: ZodTypeAny;
  bodyMediaType?: string;
  public?: boolean;
  developmentOnly?: boolean;
  errors?: number[];
}

function response(status: number) {
  if (status === 204) return { description: "The operation completed successfully." };
  if (status >= 400) {
    return {
      description: "The request failed.",
      content: { "application/json": { schema: apiErrorSchema } },
    };
  }
  return {
    description: status === 201 ? "The resource was created." : "The operation completed successfully.",
    content: { "application/json": { schema: jsonResponseSchema } },
  };
}

function addRoute(route: RouteDefinition): void {
  const errorStatuses = route.errors ?? [400, 401, 404, 409, 422];
  const responses = {
    [route.success]: response(route.success),
    ...Object.fromEntries([...errorStatuses, 500].map((status) => [status, response(status)])),
  };
  const mediaType = route.bodyMediaType ?? "application/json";

  registry.registerPath({
    method: route.method,
    path: route.path,
    tags: [route.tag],
    summary: route.summary,
    ...(route.developmentOnly ? { "x-development-only": true } : {}),
    ...(route.public ? { security: [] } : {}),
    request: {
      ...(route.params ? { params: route.params } : {}),
      ...(route.query ? { query: route.query } : {}),
      ...(route.body
        ? {
            body: {
              required: true,
              content: { [mediaType]: { schema: route.body } },
            },
          }
        : {}),
    },
    responses,
  });
}

const routes: RouteDefinition[] = [
  { method: "get", path: "/health", tag: "Health", summary: "Check API health", success: 200, public: true, errors: [] },
  { method: "get", path: "/api/auth/status", tag: "Authentication", summary: "Check whether initial setup is required", success: 200, public: true, errors: [] },
  { method: "post", path: "/api/auth/setup", tag: "Authentication", summary: "Create the first administrator account", success: 201, body: setupSchema, public: true, errors: [400, 409] },
  { method: "post", path: "/api/auth/login", tag: "Authentication", summary: "Sign in and receive a bearer token", success: 200, body: credentialsSchema, public: true, errors: [400, 401] },
  { method: "get", path: "/api/auth/me", tag: "Authentication", summary: "Get the authenticated player", success: 200, errors: [401] },
  { method: "post", path: "/api/dev/users", tag: "Development", summary: "Create a player account during development", success: 201, body: userSchema, errors: [400, 401, 403, 409], developmentOnly: true },
  { method: "get", path: "/api/shelves", tag: "Shelves", summary: "List storage containers", success: 200 },
  { method: "post", path: "/api/shelves", tag: "Shelves", summary: "Create a storage container", success: 201, body: createShelfSchema },
  { method: "patch", path: "/api/shelves/{id}", tag: "Shelves", summary: "Update a storage container", success: 200, params: idParams, body: updateShelfSchema },
  { method: "delete", path: "/api/shelves/{id}", tag: "Shelves", summary: "Delete an empty storage container", success: 204, params: idParams },
  { method: "get", path: "/api/games", tag: "Games", summary: "Search and list library games", success: 200, query: gameListQuerySchema },
  { method: "get", path: "/api/games/collection-pulse", tag: "Games", summary: "Get recent collection activity", success: 200 },
  { method: "post", path: "/api/games", tag: "Games", summary: "Add a game to the library", success: 201, body: createGameSchema },
  { method: "get", path: "/api/games/deleted-matches", tag: "Games", summary: "Find archived games by name", success: 200, query: deletedMatchQuerySchema },
  { method: "post", path: "/api/games/restore", tag: "Games", summary: "Restore an archived game", success: 200, body: restoreGameSchema },
  { method: "put", path: "/api/games/arrangement", tag: "Games", summary: "Save a shelf arrangement", success: 200, body: arrangementSchema },
  { method: "get", path: "/api/games/{id}", tag: "Games", summary: "Get a game and its documents", success: 200, params: idParams },
  { method: "post", path: "/api/games/{id}/documents", tag: "Game documents", summary: "Add a game document", success: 201, params: idParams, body: createDocumentSchema },
  { method: "patch", path: "/api/games/{id}/documents/{documentId}", tag: "Game documents", summary: "Update a game document", success: 200, params: documentParams, body: updateDocumentSchema },
  { method: "delete", path: "/api/games/{id}/documents/{documentId}", tag: "Game documents", summary: "Delete a game document", success: 204, params: documentParams },
  { method: "post", path: "/api/games/{id}/tags", tag: "Tags", summary: "Assign a tag to a game", success: 200, params: idParams, body: tagAssociationSchema },
  { method: "delete", path: "/api/games/{id}/tags/{tagId}", tag: "Tags", summary: "Remove a tag from a game", success: 200, params: gameTagParams },
  { method: "patch", path: "/api/games/{id}", tag: "Games", summary: "Update a library game", success: 200, params: idParams, body: updateGameSchema },
  { method: "delete", path: "/api/games/{id}", tag: "Games", summary: "Archive a library game", success: 200, params: idParams },
  { method: "post", path: "/api/games/{id}/image", tag: "Games", summary: "Upload a game image", success: 200, params: idParams, body: z.object({ image: z.string().openapi({ format: "binary" }) }), bodyMediaType: "multipart/form-data", errors: [400, 401, 404, 413] },
  { method: "get", path: "/api/tags", tag: "Tags", summary: "List tags used by library games", success: 200 },
  { method: "post", path: "/api/tags", tag: "Tags", summary: "Create a tag", success: 201, body: createTagSchema },
  { method: "get", path: "/api/players", tag: "Players", summary: "List registered players", success: 200 },
  { method: "get", path: "/api/games/{gameId}/reviews", tag: "Game feedback", summary: "Get ratings and awards for a game", success: 200, params: gameIdParams },
  { method: "put", path: "/api/games/{gameId}/ratings/me", tag: "Game feedback", summary: "Create or update the current player's rating", success: 200, params: gameIdParams, body: ratingSchema },
  { method: "delete", path: "/api/games/{gameId}/ratings/me", tag: "Game feedback", summary: "Delete the current player's rating", success: 204, params: gameIdParams },
  { method: "post", path: "/api/games/{gameId}/awards", tag: "Game feedback", summary: "Record an award for a game", success: 201, params: gameIdParams, body: awardSchema },
  { method: "delete", path: "/api/games/{gameId}/awards/{awardId}", tag: "Game feedback", summary: "Delete a game award", success: 204, params: awardParams },
  { method: "get", path: "/api/play-logs/guest-games", tag: "Play logs", summary: "Search guest games used in play logs", success: 200, query: guestGameListQuerySchema },
  { method: "get", path: "/api/play-logs", tag: "Play logs", summary: "List play logs and filtered statistics", success: 200, query: playLogListQuerySchema },
  { method: "post", path: "/api/play-logs", tag: "Play logs", summary: "Create a play log", success: 201, body: playLogSchema },
  { method: "put", path: "/api/play-logs/{id}", tag: "Play logs", summary: "Replace a play log", success: 200, params: idParams, body: playLogSchema },
  { method: "delete", path: "/api/play-logs/{id}", tag: "Play logs", summary: "Delete a play log", success: 204, params: idParams },
  { method: "get", path: "/api/game-nights", tag: "Game nights", summary: "List recent game nights", success: 200 },
  { method: "get", path: "/api/game-nights/{id}", tag: "Game nights", summary: "Get a game-night recap", success: 200, params: z.object({ id: gameNightIdSchema }) },
  { method: "post", path: "/api/game-nights", tag: "Game nights", summary: "Start a game night", success: 201, errors: [401, 409] },
  { method: "post", path: "/api/game-nights/{id}/close", tag: "Game nights", summary: "Close a game night", success: 200, params: z.object({ id: gameNightIdSchema }), errors: [401, 404, 409] },
  { method: "get", path: "/api/ongoing-games", tag: "Ongoing games", summary: "List games currently in progress", success: 200 },
  { method: "post", path: "/api/ongoing-games", tag: "Ongoing games", summary: "Start an ongoing game", success: 201, body: startSchema, errors: [400, 401, 404, 409, 422] },
  { method: "get", path: "/api/ongoing-games/{id}", tag: "Ongoing games", summary: "Get an ongoing game", success: 200, params: z.object({ id: ongoingGameIdSchema }) },
  { method: "post", path: "/api/ongoing-games/{id}/pause", tag: "Ongoing games", summary: "Pause an ongoing game", success: 200, params: z.object({ id: ongoingGameIdSchema }), errors: [400, 401, 404, 409] },
  { method: "post", path: "/api/ongoing-games/{id}/resume", tag: "Ongoing games", summary: "Resume an ongoing game", success: 200, params: z.object({ id: ongoingGameIdSchema }), errors: [400, 401, 404, 409] },
  { method: "post", path: "/api/ongoing-games/{id}/finish", tag: "Ongoing games", summary: "Finish a game and create its play log", success: 201, params: z.object({ id: ongoingGameIdSchema }), body: finishSchema, errors: [400, 401, 404, 422] },
  { method: "get", path: "/api/wiki", tag: "Wiki", summary: "Search glossary entries and categories", success: 200, query: wikiSearchQuerySchema },
  { method: "post", path: "/api/wiki/categories", tag: "Wiki", summary: "Create a glossary category", success: 201, body: categorySchema },
  { method: "patch", path: "/api/wiki/categories/{id}", tag: "Wiki", summary: "Update a glossary category", success: 200, params: z.object({ id: wikiIdSchema }), body: updateCategorySchema },
  { method: "delete", path: "/api/wiki/categories/{id}", tag: "Wiki", summary: "Delete an empty glossary category", success: 204, params: z.object({ id: wikiIdSchema }) },
  { method: "post", path: "/api/wiki/entries", tag: "Wiki", summary: "Create a glossary entry", success: 201, body: createEntrySchema },
  { method: "patch", path: "/api/wiki/entries/{id}", tag: "Wiki", summary: "Update a glossary entry", success: 200, params: z.object({ id: wikiIdSchema }), body: updateEntrySchema },
  { method: "delete", path: "/api/wiki/entries/{id}", tag: "Wiki", summary: "Delete a glossary entry", success: 204, params: z.object({ id: wikiIdSchema }) },
  { method: "get", path: "/api/ambience", tag: "Ambience", summary: "List ambience setups", success: 200 },
  { method: "get", path: "/api/ambience/for-game/{gameId}", tag: "Ambience", summary: "Find ambience setups for a game", success: 200, params: gameIdParams },
  { method: "post", path: "/api/ambience", tag: "Ambience", summary: "Create an ambience setup", success: 201, body: ambienceSetSchema, errors: [400, 401, 404, 422] },
  { method: "patch", path: "/api/ambience/{id}", tag: "Ambience", summary: "Replace an ambience setup", success: 200, params: z.object({ id: ambienceIdSchema }), body: ambienceSetSchema, errors: [400, 401, 404, 422] },
  { method: "delete", path: "/api/ambience/{id}", tag: "Ambience", summary: "Delete an ambience setup", success: 204, params: z.object({ id: ambienceIdSchema }) },
  { method: "get", path: "/api/wishlist", tag: "Wishlist", summary: "List and filter wishlist items", success: 200, query: wishlistListQuerySchema },
  { method: "post", path: "/api/wishlist", tag: "Wishlist", summary: "Add a game to the wishlist", success: 201, body: createWishlistItemSchema },
  { method: "patch", path: "/api/wishlist/{id}", tag: "Wishlist", summary: "Update a wishlist item", success: 200, params: interestParams, body: updateWishlistItemSchema },
  { method: "delete", path: "/api/wishlist/{id}", tag: "Wishlist", summary: "Permanently remove an archived wishlist item", success: 204, params: interestParams, errors: [400, 401, 404, 409] },
  { method: "put", path: "/api/wishlist/{id}/interests/me", tag: "Wishlist", summary: "Register the current player's interest", success: 204, params: interestParams, errors: [400, 401, 404, 409] },
  { method: "delete", path: "/api/wishlist/{id}/interests/me", tag: "Wishlist", summary: "Remove the current player's interest", success: 204, params: interestParams, errors: [400, 401, 404] },
];

for (const route of routes) addRoute(route);

const generatedDocument = new OpenApiGeneratorV3(registry.definitions).generateDocument({
  openapi: "3.0.3",
  info: {
    title: "Board Game Manager API",
    version: "1.0.0",
    description: "REST API for managing a board-game collection, play history, players, and related resources.",
  },
  servers: [{ url: "/", description: "Current host" }],
  tags: [
    { name: "Health", description: "Service health" },
    { name: "Authentication", description: "Initial setup and player authentication" },
    { name: "Development", description: "Development-only account operations" },
    { name: "Shelves", description: "Storage containers and their levels" },
    { name: "Games", description: "Board-game library and shelf arrangement" },
    { name: "Game documents", description: "Rules and other game documents" },
    { name: "Tags", description: "Game labels" },
    { name: "Players", description: "Registered players" },
    { name: "Game feedback", description: "Player ratings and game awards" },
    { name: "Play logs", description: "Recorded sessions and play insights" },
    { name: "Game nights", description: "Grouped sessions and recaps" },
    { name: "Ongoing games", description: "In-progress games and closeout" },
    { name: "Wiki", description: "Glossary categories and entries" },
    { name: "Ambience", description: "Music and visual ambience setups" },
    { name: "Wishlist", description: "Shared wishlist items and interest" },
  ],
});

export const openApiDocument = {
  ...generatedDocument,
  security: [{ BearerAuth: [] }],
  components: {
    ...generatedDocument.components,
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
};

