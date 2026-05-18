-- CreateTable
CREATE TABLE "Circle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Circle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CircleMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "circleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "externalId" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CircleMembership_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CircleMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CircleHabitShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "circleId" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CircleHabitShare_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CircleHabitShare_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CircleToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "circleId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CircleToken_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CircleMembership_externalId_idx" ON "CircleMembership"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CircleMembership_circleId_userId_key" ON "CircleMembership"("circleId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CircleMembership_circleId_externalId_key" ON "CircleMembership"("circleId", "externalId");

-- CreateIndex
CREATE INDEX "CircleHabitShare_habitId_idx" ON "CircleHabitShare"("habitId");

-- CreateIndex
CREATE UNIQUE INDEX "CircleHabitShare_circleId_habitId_key" ON "CircleHabitShare"("circleId", "habitId");

-- CreateIndex
CREATE UNIQUE INDEX "CircleToken_token_key" ON "CircleToken"("token");

-- CreateIndex
CREATE INDEX "CircleToken_circleId_idx" ON "CircleToken"("circleId");
