import { createHash, randomBytes } from "node:crypto";

import type { PrismaClient } from "../generated/prisma/client";

export function generateCircleToken() {
  return `haaabit_circle_${randomBytes(24).toString("hex")}`;
}

export function hashCircleToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createCircleToken(db: PrismaClient, circleId: string, label?: string) {
  const token = generateCircleToken();
  const tokenHash = hashCircleToken(token);

  const record = await db.circleToken.create({
    data: {
      circleId,
      token: tokenHash,
      label: label ?? null,
    },
    select: {
      id: true,
      createdAt: true,
    },
  });

  return {
    token,
    tokenId: record.id,
    createdAt: record.createdAt,
  };
}

export async function findCircleByToken(db: PrismaClient, token: string) {
  const record = await db.circleToken.findUnique({
    where: {
      token: hashCircleToken(token),
    },
    select: {
      id: true,
      circle: {
        select: {
          id: true,
          name: true,
          ownerId: true,
        },
      },
    },
  });

  if (!record) return null;

  return {
    circle: record.circle,
    tokenId: record.id,
  };
}

export async function listCircleTokens(db: PrismaClient, circleId: string) {
  return db.circleToken.findMany({
    where: { circleId },
    select: {
      id: true,
      circleId: true,
      label: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function revokeCircleToken(db: PrismaClient, tokenId: string) {
  await db.circleToken.delete({
    where: { id: tokenId },
  });
}
