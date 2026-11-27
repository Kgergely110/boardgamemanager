import { Prisma } from "@prisma/client";
import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";

const router = Router();
export const idSchema = z.string().uuid();
export const idsSchema = z.array(idSchema).max(200).refine(
  (ids) => new Set(ids).size === ids.length,
  "IDs must not contain duplicates",
);

const spotifyContentTypes = new Set(["album", "artist", "episode", "playlist", "show", "track"]);

function isSpotifyEmbedUri(value: string): boolean {
  const uriMatch = /^spotify:(album|artist|episode|playlist|show|track):([A-Za-z0-9]+)$/i.exec(value);
  if (uriMatch) return spotifyContentTypes.has(uriMatch[1].toLowerCase());

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "open.spotify.com") return false;
    const path = url.pathname.split("/").filter(Boolean);
    if (path[0]?.startsWith("intl-")) path.shift();
    if (path[0] === "embed") path.shift();
    return spotifyContentTypes.has(path[0]?.toLowerCase() ?? "") &&
      /^[A-Za-z0-9]+$/.test(path[1] ?? "");
  } catch {
    return false;
  }
}

export const linkSchema = z.object({
  title: z.string().trim().min(1).max(100),
  kind: z.enum(["music", "visual", "both"]),
  embed: z.boolean().default(false),
  uri: z.string().trim().min(1).max(2048).refine((value) => {
    try {
      return ["http:", "https:", "spotify:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "Use an HTTP(S) link or Spotify URI"),
}).superRefine((link, context) => {
  if (link.embed && !isSpotifyEmbedUri(link.uri)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["uri"],
      message: "Embedded playback requires a Spotify track, album, artist, playlist, show, or episode link",
    });
  }
  if (link.embed && link.kind === "visual") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["kind"],
      message: "Spotify embeds are audio; choose Music or Music & visual",
    });
  }
});

export const ambienceSetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional()
    .transform((value) => value || null),
  gameIds: idsSchema,
  tagIds: idsSchema,
  links: z.array(linkSchema).min(1).max(20),
});

const ambienceSetInclude = {
  games: {
    where: { deletedGame: { is: null } },
    select: { id: true, name: true, maker: true },
    orderBy: { name: "asc" },
  },
  tags: { select: { id: true, name: true, color: true }, orderBy: { name: "asc" } },
  links: {
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, kind: true, uri: true, embed: true, position: true },
  },
} satisfies Prisma.AmbienceSetInclude;

async function validateAssociations(gameIds: string[], tagIds: string[]): Promise<boolean> {
  const [games, tags] = await Promise.all([
    prisma.game.count({ where: { id: { in: gameIds }, deletedGame: { is: null } } }),
    prisma.tag.count({ where: { id: { in: tagIds } } }),
  ]);
  return games === gameIds.length && tags === tagIds.length;
}

function linkCreateData(links: z.infer<typeof linkSchema>[]) {
  return links.map((link, position) => ({ ...link, position }));
}

router.get("/", async (_req: Request, res: Response) => {
  const data = await prisma.ambienceSet.findMany({
    orderBy: [{ name: "asc" }, { id: "asc" }],
    include: ambienceSetInclude,
  });
  res.json({ data });
});

router.get("/for-game/:gameId", async (req: Request, res: Response) => {
  const gameId = idSchema.safeParse(req.params.gameId);
  if (!gameId.success) {
    res.status(400).json({ error: "Invalid game id" });
    return;
  }

  const game = await prisma.game.findFirst({
    where: { id: gameId.data, deletedGame: { is: null } },
    select: { id: true, tags: { select: { id: true } } },
  });
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const tagIds = game.tags.map((tag) => tag.id);
  const data = await prisma.ambienceSet.findMany({
    where: {
      OR: [
        { games: { some: { id: game.id } } },
        { tags: { some: { id: { in: tagIds } } } },
      ],
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    include: ambienceSetInclude,
  });
  res.json({ data });
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = ambienceSetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid ambience setup",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }
  const input = parsed.data;
  if (!(await validateAssociations(input.gameIds, input.tagIds))) {
    res.status(400).json({ error: "One or more selected games or tags could not be found" });
    return;
  }

  const data = await prisma.ambienceSet.create({
    data: {
      name: input.name,
      description: input.description,
      games: { connect: input.gameIds.map((id) => ({ id })) },
      tags: { connect: input.tagIds.map((id) => ({ id })) },
      links: { create: linkCreateData(input.links) },
    },
    include: ambienceSetInclude,
  });
  res.status(201).json({ data });
});

router.patch("/:id", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid ambience setup id" });
    return;
  }
  const parsed = ambienceSetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid ambience setup",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }
  const input = parsed.data;
  if (!(await validateAssociations(input.gameIds, input.tagIds))) {
    res.status(400).json({ error: "One or more selected games or tags could not be found" });
    return;
  }

  const exists = await prisma.ambienceSet.findUnique({
    where: { id: id.data },
    select: { id: true },
  });
  if (!exists) {
    res.status(404).json({ error: "Ambience setup not found" });
    return;
  }

  const data = await prisma.ambienceSet.update({
    where: { id: id.data },
    data: {
      name: input.name,
      description: input.description,
      games: { set: input.gameIds.map((gameId) => ({ id: gameId })) },
      tags: { set: input.tagIds.map((tagId) => ({ id: tagId })) },
      links: {
        deleteMany: {},
        create: linkCreateData(input.links),
      },
    },
    include: ambienceSetInclude,
  });
  res.json({ data });
});

router.delete("/:id", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid ambience setup id" });
    return;
  }
  const deleted = await prisma.ambienceSet.deleteMany({ where: { id: id.data } });
  if (deleted.count !== 1) {
    res.status(404).json({ error: "Ambience setup not found" });
    return;
  }
  res.status(204).end();
});

export default router;
