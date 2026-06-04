-- CreateTable
CREATE TABLE "UserAvatar" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAvatar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdImage" (
    "id" SERIAL NOT NULL,
    "adId" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserAvatar_userId_key" ON "UserAvatar"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAvatar_storageKey_key" ON "UserAvatar"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "AdImage_storageKey_key" ON "AdImage"("storageKey");

-- CreateIndex
CREATE INDEX "AdImage_adId_position_idx" ON "AdImage"("adId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "AdImage_adId_position_key" ON "AdImage"("adId", "position");

-- AddForeignKey
ALTER TABLE "UserAvatar"
    ADD CONSTRAINT "UserAvatar_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdImage"
    ADD CONSTRAINT "AdImage_adId_fkey"
    FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;