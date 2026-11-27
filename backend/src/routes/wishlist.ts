import { Prisma } from "@prisma/client";
import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { sendApiError, sendValidationError } from "../lib/http.js";

const router = Router();
export const idSchema = z.string().uuid();
const statuses = ["CONSIDERING", "WANTED", "ORDERED"] as const;
const filterStatuses = [...statuses, "ACQUIRED", "ARCHIVED"] as const;
const priorities = ["LOW", "NORMAL", "HIGH"] as const;
const maxEstimatedPriceCents = 1_000_000_000_000;

const httpUrlSchema = z.string().trim().max(2048).url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "Use an HTTP or HTTPS link").nullable().optional();

const sharedFields = {
  title: z.string().trim().min(1).max(120),
  maker: z.string().trim().max(120).nullable().optional(),
  releaseYear: z.number().int().min(1800).max(2200).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  imageUrl: httpUrlSchema,
  sourceUrl: httpUrlSchema,
  minPlayers: z.number().int().min(1).max(100).nullable().optional(),
  maxPlayers: z.number().int().min(1).max(100).nullable().optional(),
  ageLimit: z.number().int().min(0).max(100).nullable().optional(),
  playTime: z.number().int().min(1).max(10000).nullable().optional(),
  estimatedPriceCents: z.number().int().min(0).max(maxEstimatedPriceCents).nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  priority: z.enum(priorities).optional(),
  tagIds: z.array(z.string().uuid()).max(30).refine(
    (ids) => new Set(ids).size === ids.length,
    "A tag can only be selected once",
  ).optional(),
};

export const createSchema = z.object({
  ...sharedFields,
  status: z.enum(statuses).default("WANTED"),
  priority: z.enum(priorities).default("NORMAL"),
}).superRefine((item, context) => {
  if (item.minPlayers !== null && item.minPlayers !== undefined &&
      item.maxPlayers !== null && item.maxPlayers !== undefined &&
      item.minPlayers > item.maxPlayers) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxPlayers"],
      message: "Must be at least the minimum player count",
    });
  }
});

export const updateSchema = z.object({
  ...sharedFields,
  status: z.enum([...statuses, "ARCHIVED"] as const).optional(),
}).partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field")
  .superRefine((item, context) => {
    if (item.minPlayers !== null && item.minPlayers !== undefined &&
        item.maxPlayers !== null && item.maxPlayers !== undefined &&
        item.minPlayers > item.maxPlayers) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxPlayers"],
        message: "Must be at least the minimum player count",
      });
    }
  });

export const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["ACTIVE", ...filterStatuses] as const).default("ACTIVE"),
  tagId: z.string().uuid().optional(),
  players: z.coerce.number().int().min(1).max(100).optional(),
  maxPlayTime: z.coerce.number().int().min(1).max(10000).optional(),
  maxAge: z.coerce.number().int().min(0).max(100).optional(),
  maxPriceCents: z.coerce.number().int().min(0).max(maxEstimatedPriceCents).optional(),
  priority: z.enum(priorities).optional(),
  sort: z.enum(["priority", "recent", "title", "interest"]).default("priority"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

const wishlistItemInclude = (playerId: string) => ({
  tags: { select: { id: true, name: true, color: true } },
  addedBy: { select: { id: true, fullName: true } },
  game: { select: { id: true, name: true, maker: true } },
  _count: { select: { interests: true } },
  interests: { where: { playerId }, select: { id: true } },
});

type WishlistItemRecord = Prisma.WishlistItemGetPayload<{
  include: ReturnType<typeof wishlistItemInclude>;
}>;

function presentItem(item: WishlistItemRecord) {
  const { interests, _count, ...record } = item;
  return {
    ...record,
    estimatedPriceCents: record.estimatedPriceCents === null ? null : Number(record.estimatedPriceCents),
    interestCount: _count.interests,
    isInterested: interests.length > 0,
  };
}

function validationError(res: Response, error: z.ZodError): void {
  sendValidationError(res, error, "Invalid wishlist request");
}

async function tagIdsExist(tagIds: string[] | undefined): Promise<boolean> {
  if (!tagIds?.length) return true;
  const count = await prisma.tag.count({ where: { id: { in: tagIds } } });
  return count === tagIds.length;
}

router.get("/", async (req: Request, res: Response) => {
  const query = listQuerySchema.safeParse(req.query);
  if (!query.success) {
    validationError(res, query.error);
    return;
  }
  const playerId = req.user?.playerId;
  if (!playerId) {
    sendApiError(res, 401, "Sign in to browse the wishlist");
    return;
  }

  const { q, status, tagId, players, maxPlayTime, maxAge, maxPriceCents, priority, sort, page, pageSize } = query.data;
  const conditions: Prisma.WishlistItemWhereInput[] = [];
  if (status === "ACTIVE") conditions.push({ status: { in: [...statuses] } });
  else conditions.push({ status });
  if (tagId) conditions.push({ tags: { some: { id: tagId } } });
  if (players !== undefined) {
    conditions.push({ minPlayers: { lte: players }, maxPlayers: { gte: players } });
  }
  if (maxPlayTime !== undefined) conditions.push({ playTime: { lte: maxPlayTime } });
  if (maxAge !== undefined) conditions.push({ ageLimit: { lte: maxAge } });
  if (maxPriceCents !== undefined) conditions.push({ estimatedPriceCents: { lte: BigInt(maxPriceCents) } });
  if (priority) conditions.push({ priority });
  if (q) {
    if (q.startsWith("#")) {
      const tagQuery = q.slice(1).trim();
      if (tagQuery) {
        conditions.push({ tags: { some: { name: { contains: tagQuery, mode: "insensitive" } } } });
      }
    } else {
      conditions.push({
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { maker: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { notes: { contains: q, mode: "insensitive" } },
          { tags: { some: { name: { contains: q, mode: "insensitive" } } } },
        ],
      });
    }
  }

  const where: Prisma.WishlistItemWhereInput = { AND: conditions };
  const orderBy: Prisma.WishlistItemOrderByWithRelationInput[] = sort === "recent"
    ? [{ createdAt: "desc" }, { id: "desc" }]
    : sort === "title"
      ? [{ title: "asc" }, { id: "asc" }]
      : sort === "interest"
        ? [{ interests: { _count: "desc" } }, { priority: "desc" }, { createdAt: "desc" }]
        : [{ priority: "desc" }, { createdAt: "desc" }, { id: "desc" }];

  const [items, total, priceGroups] = await Promise.all([
    prisma.wishlistItem.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: wishlistItemInclude(playerId),
    }),
    prisma.wishlistItem.count({ where }),
    prisma.wishlistItem.groupBy({
      by: ["currency"],
      where: { AND: [...conditions, { estimatedPriceCents: { not: null } }] },
      _sum: { estimatedPriceCents: true },
      _count: { _all: true },
    }),
  ]);
  const priceSummaryByCurrency = new Map<string, { count: number; totalCents: bigint }>();
  for (const group of priceGroups) {
    const currency = group.currency ?? "HUF";
    const current = priceSummaryByCurrency.get(currency) ?? { count: 0, totalCents: 0n };
    current.count += group._count._all;
    current.totalCents += group._sum.estimatedPriceCents ?? 0n;
    priceSummaryByCurrency.set(currency, current);
  }
  const pricesByCurrency = [...priceSummaryByCurrency].map(([currency, summary]) => ({
    currency,
    count: summary.count,
    totalCents: summary.totalCents.toString(),
  }));
  res.json({
    data: items.map(presentItem),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    summary: {
      pricedCount: pricesByCurrency.reduce((count, group) => count + group.count, 0),
      pricesByCurrency,
    },
  });
});

router.post("/", async (req: Request, res: Response) => {
  const result = createSchema.safeParse(req.body);
  if (!result.success) {
    validationError(res, result.error);
    return;
  }
  const playerId = req.user?.playerId;
  if (!playerId) {
    sendApiError(res, 401, "Sign in to add a game to the wishlist");
    return;
  }
  if (!(await tagIdsExist(result.data.tagIds))) {
    sendApiError(res, 422, "One or more selected tags no longer exist");
    return;
  }

  const { tagIds, ...fields } = result.data;
  const item = await prisma.wishlistItem.create({
    data: {
      ...fields,
      estimatedPriceCents: fields.estimatedPriceCents == null ? fields.estimatedPriceCents : BigInt(fields.estimatedPriceCents),
      currency: fields.estimatedPriceCents == null ? null : fields.currency ?? "EUR",
      addedById: playerId,
      ...(tagIds?.length ? { tags: { connect: tagIds.map((id) => ({ id })) } } : {}),
    },
    include: wishlistItemInclude(playerId),
  });
  res.status(201).json({ data: presentItem(item) });
});

router.patch("/:id", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  const result = updateSchema.safeParse(req.body);
  if (!id.success || !result.success) {
    if (!id.success) validationError(res, id.error);
    else if (!result.success) validationError(res, result.error);
    return;
  }
  const playerId = req.user?.playerId;
  if (!playerId) {
    sendApiError(res, 401, "Sign in to update the wishlist");
    return;
  }

  const existing = await prisma.wishlistItem.findUnique({
    where: { id: id.data },
    select: { id: true, status: true, minPlayers: true, maxPlayers: true },
  });
  if (!existing) {
    sendApiError(res, 404, "Wishlist item not found");
    return;
  }
  if (existing.status === "ACQUIRED" && result.data.status) {
    sendApiError(res, 409, "Acquired games can’t change wishlist status");
    return;
  }
  const minPlayers = result.data.minPlayers === undefined ? existing.minPlayers : result.data.minPlayers;
  const maxPlayers = result.data.maxPlayers === undefined ? existing.maxPlayers : result.data.maxPlayers;
  if (minPlayers !== null && maxPlayers !== null && minPlayers > maxPlayers) {
    sendApiError(res, 422, "Invalid wishlist request", "UNPROCESSABLE_ENTITY", {
      details: { maxPlayers: ["Must be at least the minimum player count"] },
    });
    return;
  }
  if (!(await tagIdsExist(result.data.tagIds))) {
    sendApiError(res, 422, "One or more selected tags no longer exist");
    return;
  }

  const { tagIds, ...fields } = result.data;
  const item = await prisma.wishlistItem.update({
    where: { id: id.data },
    data: {
      ...fields,
      estimatedPriceCents: fields.estimatedPriceCents == null ? fields.estimatedPriceCents : BigInt(fields.estimatedPriceCents),
      ...(fields.estimatedPriceCents === null
        ? { currency: null }
        : fields.estimatedPriceCents !== undefined && fields.currency === undefined
          ? { currency: "EUR" }
          : {}),
      ...(tagIds === undefined ? {} : { tags: { set: tagIds.map((tagId) => ({ id: tagId })) } }),
    },
    include: wishlistItemInclude(playerId),
  });
  res.json({ data: presentItem(item) });
});

router.delete("/:id", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    validationError(res, id.error);
    return;
  }
  if (!req.user?.playerId) {
    sendApiError(res, 401, "Sign in to remove a wishlist item");
    return;
  }

  const deleted = await prisma.wishlistItem.deleteMany({
    where: { id: id.data, status: "ARCHIVED", gameId: null },
  });
  if (deleted.count !== 1) {
    const item = await prisma.wishlistItem.findUnique({
      where: { id: id.data },
      select: { id: true },
    });
    sendApiError(
      res,
      item ? 409 : 404,
      item
        ? "Only archived wishlist items that have not been acquired can be permanently removed"
        : "Wishlist item not found",
    );
    return;
  }
  res.status(204).end();
});

router.put("/:id/interests/me", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    validationError(res, id.error);
    return;
  }
  const playerId = req.user?.playerId;
  if (!playerId) {
    sendApiError(res, 401, "Sign in to register your interest");
    return;
  }
  const item = await prisma.wishlistItem.findUnique({
    where: { id: id.data },
    select: { id: true, status: true },
  });
  if (!item) {
    sendApiError(res, 404, "Wishlist item not found");
    return;
  }
  if (item.status === "ACQUIRED" || item.status === "ARCHIVED") {
    sendApiError(res, 409, "Interest can only be recorded for an active wishlist item");
    return;
  }
  await prisma.wishlistInterest.upsert({
    where: { wishlistItemId_playerId: { wishlistItemId: id.data, playerId } },
    create: { wishlistItemId: id.data, playerId },
    update: {},
  });
  res.status(204).end();
});

router.delete("/:id/interests/me", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    validationError(res, id.error);
    return;
  }
  const playerId = req.user?.playerId;
  if (!playerId) {
    sendApiError(res, 401, "Sign in to remove your interest");
    return;
  }
  await prisma.wishlistInterest.deleteMany({
    where: { wishlistItemId: id.data, playerId },
  });
  res.status(204).end();
});

export default router;
