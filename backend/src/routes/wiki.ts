import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma.js";

const router = Router();
const idSchema = z.string().uuid();
const categorySchema = z.object({
  title: z.string().trim().min(1).max(80),
});
const updateCategorySchema = categorySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide a category title");
const idListSchema = z.array(idSchema).max(100).refine(
  (ids) => new Set(ids).size === ids.length,
  "IDs must be unique",
);
const entryFields = {
  title: z.string().trim().min(1).max(120),
  content: z.string().max(100_000),
  categoryId: idSchema,
  tagIds: idListSchema,
  gameIds: idListSchema,
};
const createEntrySchema = z.object({
  ...entryFields,
  tagIds: idListSchema.default([]),
  gameIds: idListSchema.default([]),
});
const updateEntrySchema = z.object(entryFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one entry field");
const searchSchema = z.object({ search: z.string().trim().max(120).optional() });

const entrySelect = {
  id: true,
  title: true,
  content: true,
  categoryId: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, title: true } },
  tags: {
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  },
  games: {
    where: { deletedGame: { is: null } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, maker: true },
  },
} satisfies Prisma.WikiEntrySelect;

function sendValidationError(res: Response, error: z.ZodError): void {
  res.status(400).json({
    error: "Invalid request",
    details: error.flatten().fieldErrors,
  });
}

function isKnownError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

async function validateAssociations(
  res: Response,
  categoryId: string,
  tagIds: string[],
  gameIds: string[],
): Promise<boolean> {
  const [category, tags, games] = await Promise.all([
    prisma.wikiCategory.findUnique({ where: { id: categoryId }, select: { id: true } }),
    tagIds.length
      ? prisma.tag.findMany({ where: { id: { in: tagIds } }, select: { id: true } })
      : [],
    gameIds.length
      ? prisma.game.findMany({
          where: { id: { in: gameIds }, deletedGame: { is: null } },
          select: { id: true },
        })
      : [],
  ]);
  if (!category) {
    res.status(400).json({ error: "Choose an existing wiki category" });
    return false;
  }
  if (tags.length !== tagIds.length) {
    res.status(400).json({ error: "One or more selected tags no longer exist" });
    return false;
  }
  if (games.length !== gameIds.length) {
    res.status(400).json({ error: "Examples must be active games in the library" });
    return false;
  }
  return true;
}

async function isDuplicateEntry(
  categoryId: string,
  title: string,
  excludeId?: string,
): Promise<boolean> {
  return Boolean(await prisma.wikiEntry.findFirst({
    where: {
      categoryId,
      title: { equals: title, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  }));
}

router.get("/", async (req: Request, res: Response) => {
  const query = searchSchema.safeParse(req.query);
  if (!query.success) {
    sendValidationError(res, query.error);
    return;
  }
  const search = (query.data.search ?? "").replace(/^#\s*/, "");
  const entryWhere: Prisma.WikiEntryWhereInput = search
    ? {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { content: { contains: search, mode: "insensitive" } },
          { category: { is: { title: { contains: search, mode: "insensitive" } } } },
          { tags: { some: { name: { contains: search, mode: "insensitive" } } } },
          {
            games: {
              some: {
                deletedGame: { is: null },
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { maker: { contains: search, mode: "insensitive" } },
                ],
              },
            },
          },
        ],
      }
    : {};

  const [categories, entries] = await Promise.all([
    prisma.wikiCategory.findMany({
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { entries: true } },
      },
    }),
    prisma.wikiEntry.findMany({
      where: entryWhere,
      orderBy: [{ category: { title: "asc" } }, { title: "asc" }],
      select: entrySelect,
    }),
  ]);
  res.json({ data: { categories, entries } });
});

router.post("/categories", async (req: Request, res: Response) => {
  const result = categorySchema.safeParse(req.body);
  if (!result.success) {
    sendValidationError(res, result.error);
    return;
  }
  const duplicate = await prisma.wikiCategory.findFirst({
    where: { title: { equals: result.data.title, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) {
    res.status(409).json({ error: "A category with this title already exists" });
    return;
  }

  try {
    const category = await prisma.wikiCategory.create({
      data: { title: result.data.title },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    res.status(201).json({ data: category });
  } catch (error) {
    if (isKnownError(error, "P2002")) {
      res.status(409).json({ error: "A category with this title already exists" });
      return;
    }
    throw error;
  }
});

router.patch("/categories/:id", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    sendValidationError(res, id.error);
    return;
  }
  const result = updateCategorySchema.safeParse(req.body);
  if (!result.success) {
    sendValidationError(res, result.error);
    return;
  }
  const existing = await prisma.wikiCategory.findUnique({ where: { id: id.data } });
  if (!existing) {
    res.status(404).json({ error: "Wiki category not found" });
    return;
  }
  if (result.data.title) {
    const duplicate = await prisma.wikiCategory.findFirst({
      where: {
        id: { not: existing.id },
        title: { equals: result.data.title, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (duplicate) {
      res.status(409).json({ error: "A category with this title already exists" });
      return;
    }
  }

  try {
    const category = await prisma.wikiCategory.update({
      where: { id: existing.id },
      data: result.data,
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    res.json({ data: category });
  } catch (error) {
    if (isKnownError(error, "P2002")) {
      res.status(409).json({ error: "A category with this title already exists" });
      return;
    }
    throw error;
  }
});

router.delete("/categories/:id", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    sendValidationError(res, id.error);
    return;
  }
  const category = await prisma.wikiCategory.findUnique({
    where: { id: id.data },
    select: { id: true, _count: { select: { entries: true } } },
  });
  if (!category) {
    res.status(404).json({ error: "Wiki category not found" });
    return;
  }
  if (category._count.entries > 0) {
    res.status(409).json({ error: "Move or delete this category's entries before deleting it" });
    return;
  }
  try {
    await prisma.wikiCategory.delete({ where: { id: category.id } });
  } catch (error) {
    if (isKnownError(error, "P2003")) {
      res.status(409).json({ error: "Move or delete the category entries before deleting it" });
      return;
    }
    throw error;
  }
  res.status(204).end();
});

router.post("/entries", async (req: Request, res: Response) => {
  const result = createEntrySchema.safeParse(req.body);
  if (!result.success) {
    sendValidationError(res, result.error);
    return;
  }
  const { title, content, categoryId, tagIds, gameIds } = result.data;
  if (!(await validateAssociations(res, categoryId, tagIds, gameIds))) return;
  if (await isDuplicateEntry(categoryId, title)) {
    res.status(409).json({ error: "An entry with this title already exists in the category" });
    return;
  }

  try {
    const entry = await prisma.wikiEntry.create({
      data: {
        title,
        content,
        category: { connect: { id: categoryId } },
        tags: { connect: tagIds.map((id) => ({ id })) },
        games: { connect: gameIds.map((id) => ({ id })) },
      },
      select: entrySelect,
    });
    res.status(201).json({ data: entry });
  } catch (error) {
    if (isKnownError(error, "P2002")) {
      res.status(409).json({ error: "An entry with this title already exists in the category" });
      return;
    }
    throw error;
  }
});

router.patch("/entries/:id", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    sendValidationError(res, id.error);
    return;
  }
  const result = updateEntrySchema.safeParse(req.body);
  if (!result.success) {
    sendValidationError(res, result.error);
    return;
  }
  const existing = await prisma.wikiEntry.findUnique({
    where: { id: id.data },
    select: { id: true, title: true, categoryId: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Wiki entry not found" });
    return;
  }

  const categoryId = result.data.categoryId ?? existing.categoryId;
  const title = result.data.title ?? existing.title;
  const tagIds = result.data.tagIds ?? [];
  const gameIds = result.data.gameIds ?? [];
  if (
    !(await validateAssociations(
      res,
      categoryId,
      result.data.tagIds ?? [],
      result.data.gameIds ?? [],
    ))
  ) return;
  if (await isDuplicateEntry(categoryId, title, existing.id)) {
    res.status(409).json({ error: "An entry with this title already exists in the category" });
    return;
  }

  const updateData: Prisma.WikiEntryUpdateInput = {};
  if (result.data.title !== undefined) updateData.title = result.data.title;
  if (result.data.content !== undefined) updateData.content = result.data.content;
  if (result.data.categoryId !== undefined) {
    updateData.category = { connect: { id: result.data.categoryId } };
  }
  if (result.data.tagIds !== undefined) {
    updateData.tags = { set: tagIds.map((id) => ({ id })) };
  }
  if (result.data.gameIds !== undefined) {
    updateData.games = { set: gameIds.map((id) => ({ id })) };
  }

  try {
    const entry = await prisma.wikiEntry.update({
      where: { id: existing.id },
      data: updateData,
      select: entrySelect,
    });
    res.json({ data: entry });
  } catch (error) {
    if (isKnownError(error, "P2002")) {
      res.status(409).json({ error: "An entry with this title already exists in the category" });
      return;
    }
    throw error;
  }
});

router.delete("/entries/:id", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    sendValidationError(res, id.error);
    return;
  }
  try {
    await prisma.wikiEntry.delete({ where: { id: id.data } });
    res.status(204).end();
  } catch (error) {
    if (isKnownError(error, "P2025")) {
      res.status(404).json({ error: "Wiki entry not found" });
      return;
    }
    throw error;
  }
});

export default router;
