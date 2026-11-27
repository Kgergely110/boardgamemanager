import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sendApiError, sendValidationError } from "../lib/http.js";
import prisma from "../lib/prisma.js";
import { gameIdSchema } from "../schemas/games.js";

const router = Router();
const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const getUploadDirectory = () => resolve(process.env.UPLOAD_DIR || "./uploads");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!imageExtensions[file.mimetype]) {
      callback(new Error("Upload a JPEG, PNG, or WebP image"));
      return;
    }
    callback(null, true);
  },
});

function parseImageUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single("image")(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError) {
      sendApiError(
        res,
        error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
        error.code === "LIMIT_FILE_SIZE" ? "Image must be 8 MB or smaller" : "Invalid image upload",
      );
      return;
    }
    sendApiError(res, 400, error instanceof Error ? error.message : "Invalid image upload");
  });
}

function detectedImageExtension(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return "png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

router.post("/:id/image", parseImageUpload, async (req: Request, res: Response) => {
  const id = gameIdSchema.safeParse(req.params.id);
  if (!id.success) {
    sendValidationError(res, id.error, "Invalid game id");
    return;
  }
  const game = await prisma.game.findFirst({
    where: { id: id.data, deletedGame: { is: null } },
    select: { id: true },
  });
  if (!game) {
    sendApiError(res, 404, "Game not found");
    return;
  }
  if (!req.file) {
    sendApiError(res, 400, "Choose an image to upload");
    return;
  }

  const extension = detectedImageExtension(req.file.buffer);
  if (!extension || imageExtensions[req.file.mimetype] !== extension) {
    sendApiError(res, 400, "File content does not match a supported image type");
    return;
  }

  const uploadDirectory = getUploadDirectory();
  await mkdir(uploadDirectory, { recursive: true });
  const fileName = `${randomUUID()}.${extension}`;
  const filePath = resolve(getUploadDirectory(), fileName);
  await writeFile(filePath, req.file.buffer, { flag: "wx" });
  const imageUrl = `/uploads/${fileName}`;

  try {
    const updated = await prisma.game.update({
      where: { id: game.id },
      data: { imageUrl },
      include: {
        shelf: { select: { id: true, name: true, type: true } },
        tags: { select: { id: true, name: true, color: true } },
      },
    });
    res.json({ data: updated });
  } catch (error) {
    try {
      await unlink(filePath);
    } catch (cleanupError) {
      console.error("Could not remove an image after the game update failed", cleanupError);
    }
    throw error;
  }
});

export default router;
