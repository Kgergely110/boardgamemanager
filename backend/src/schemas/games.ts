import { z } from "zod";

export const gameIdSchema = z.string().uuid();

export const tagAssociationSchema = z.object({ tagId: gameIdSchema });

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(100),
  content: z.string().max(100_000),
});

export const updateDocumentSchema = createDocumentSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one document field");

const imageUrlSchema = z.string().trim().max(2048).refine((value) => {
  if (value.startsWith("/uploads/") && !value.includes("..")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
});

const gameFields = {
  name: z.string().trim().min(1).max(120),
  maker: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  releaseYear: z.number().int().min(1800).max(2200).optional(),
  minPlayers: z.number().int().min(1).max(100).optional(),
  maxPlayers: z.number().int().min(1).max(100).optional(),
  ageLimit: z.number().int().min(0).max(100).optional(),
  playTime: z.number().int().min(1).max(10000).optional(),
  shelfId: gameIdSchema,
  shelfNumber: z.number().int().min(1).max(100).default(1),
  orientation: z.enum(["vertical", "horizontal", "flat", "stacked"]).default("vertical"),
  stackedOnId: gameIdSchema.nullable().optional(),
  imageUrl: imageUrlSchema.optional(),
};

function validateGameFields(
  { minPlayers, maxPlayers, orientation, stackedOnId }: {
    minPlayers?: number;
    maxPlayers?: number;
    orientation: "vertical" | "horizontal" | "flat" | "stacked";
    stackedOnId?: string | null;
  },
  context: z.RefinementCtx,
): void {
  if (minPlayers !== undefined && maxPlayers !== undefined && minPlayers > maxPlayers) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxPlayers"],
      message: "Must be at least the minimum players",
    });
  }
  if (orientation === "stacked" && !stackedOnId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stackedOnId"],
      message: "Choose the game this one will be stacked on",
    });
  }
  if (orientation !== "stacked" && stackedOnId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stackedOnId"],
      message: "Only stacked games can be placed on another game",
    });
  }
}

export const createGameSchema = z
  .object({ ...gameFields, wishlistItemId: gameIdSchema.optional() })
  .superRefine(validateGameFields);

export const updateGameSchema = z
  .object({
    ...gameFields,
    imageUrl: imageUrlSchema.nullable().optional(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field");

export const restoreGameSchema = z
  .object({ ...gameFields, deletedGameId: gameIdSchema })
  .superRefine(validateGameFields);

export const deletedMatchQuerySchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const arrangementSchema = z.object({
  shelfId: gameIdSchema,
  shelfNumber: z.number().int().min(1).max(100),
  items: z.array(z.object({
    id: gameIdSchema,
    order: z.number().int().min(1).max(2000),
    stackedOnId: gameIdSchema.nullable(),
    orientation: z.enum(["vertical", "horizontal", "flat"]).optional(),
  })).min(1).max(2000),
});

export const gameListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  shelfId: gameIdSchema.optional(),
});
