-- Remove development-owner defaults from tenant-owned records. Application
-- writes must always supply the authenticated owner explicitly.
ALTER TABLE "Watchlist" ALTER COLUMN "ownerId" DROP DEFAULT;
ALTER TABLE "SavedScanner" ALTER COLUMN "ownerId" DROP DEFAULT;
ALTER TABLE "Alert" ALTER COLUMN "ownerId" DROP DEFAULT;
ALTER TABLE "SavedWorkspace" ALTER COLUMN "ownerId" DROP DEFAULT;
ALTER TABLE "Notes" ALTER COLUMN "ownerId" DROP DEFAULT;

-- CreateEnum
CREATE TYPE "ScannerRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELED');

-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE 'OPTIONS';

-- Extend the existing generic alert record without changing its current
-- configuration payload or alert-type discriminator.
ALTER TABLE "Alert"
    ADD COLUMN "watchlistId" TEXT,
    ADD COLUMN "cooldownMinutes" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "deliveryChannels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "lastEvaluatedAt" TIMESTAMP(3),
    ADD COLUMN "nextEvaluationAt" TIMESTAMP(3),
    ADD COLUMN "lastDeliveredAt" TIMESTAMP(3),
    ADD COLUMN "lastDeliveryKey" TEXT,
    ADD COLUMN "lastDeliveryError" TEXT;

-- CreateTable
CREATE TABLE "ScannerCondition" (
    "id" TEXT NOT NULL,
    "scannerId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "field" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "secondaryValue" JSONB,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScannerCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScannerRun" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "scannerId" TEXT,
    "status" "ScannerRunStatus" NOT NULL DEFAULT 'PENDING',
    "definition" JSONB NOT NULL,
    "universe" JSONB,
    "candidateCount" INTEGER,
    "matchCount" INTEGER,
    "durationMs" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScannerRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScannerResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "symbol" VARCHAR(15) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScannerResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadNewsArticle" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "articleId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadNewsArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CachedEvent" (
    "id" TEXT NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "symbol" VARCHAR(15) NOT NULL,
    "eventType" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CachedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CachedNewsMetadata" (
    "id" TEXT NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "articleId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "symbols" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "payload" JSONB NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CachedNewsMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScannerCondition_scannerId_position_key" ON "ScannerCondition"("scannerId", "position");
CREATE INDEX "ScannerCondition_scannerId_updatedAt_idx" ON "ScannerCondition"("scannerId", "updatedAt");
CREATE INDEX "ScannerRun_ownerId_startedAt_idx" ON "ScannerRun"("ownerId", "startedAt");
CREATE INDEX "ScannerRun_scannerId_startedAt_idx" ON "ScannerRun"("scannerId", "startedAt");
CREATE INDEX "ScannerRun_status_startedAt_idx" ON "ScannerRun"("status", "startedAt");
CREATE UNIQUE INDEX "ScannerResult_runId_symbol_key" ON "ScannerResult"("runId", "symbol");
CREATE INDEX "ScannerResult_runId_position_idx" ON "ScannerResult"("runId", "position");
CREATE INDEX "ScannerResult_symbol_createdAt_idx" ON "ScannerResult"("symbol", "createdAt");
CREATE UNIQUE INDEX "ReadNewsArticle_ownerId_source_articleId_key" ON "ReadNewsArticle"("ownerId", "source", "articleId");
CREATE INDEX "ReadNewsArticle_ownerId_readAt_idx" ON "ReadNewsArticle"("ownerId", "readAt");
CREATE INDEX "ReadNewsArticle_source_articleId_idx" ON "ReadNewsArticle"("source", "articleId");
CREATE UNIQUE INDEX "CachedEvent_source_providerEventId_key" ON "CachedEvent"("source", "providerEventId");
CREATE UNIQUE INDEX "CachedEvent_dedupeKey_key" ON "CachedEvent"("dedupeKey");
CREATE INDEX "CachedEvent_symbol_startsAt_idx" ON "CachedEvent"("symbol", "startsAt");
CREATE INDEX "CachedEvent_expiresAt_idx" ON "CachedEvent"("expiresAt");
CREATE INDEX "CachedEvent_source_asOf_idx" ON "CachedEvent"("source", "asOf");
CREATE UNIQUE INDEX "CachedNewsMetadata_source_articleId_key" ON "CachedNewsMetadata"("source", "articleId");
CREATE UNIQUE INDEX "CachedNewsMetadata_dedupeKey_key" ON "CachedNewsMetadata"("dedupeKey");
CREATE INDEX "CachedNewsMetadata_publishedAt_idx" ON "CachedNewsMetadata"("publishedAt");
CREATE INDEX "CachedNewsMetadata_expiresAt_idx" ON "CachedNewsMetadata"("expiresAt");
CREATE INDEX "CachedNewsMetadata_source_asOf_idx" ON "CachedNewsMetadata"("source", "asOf");
CREATE INDEX "CachedNewsMetadata_symbols_idx" ON "CachedNewsMetadata" USING GIN ("symbols");
CREATE INDEX "CachedNewsMetadata_categories_idx" ON "CachedNewsMetadata" USING GIN ("categories");
CREATE INDEX "Alert_ownerId_updatedAt_idx" ON "Alert"("ownerId", "updatedAt");
CREATE INDEX "Alert_ownerId_symbol_type_idx" ON "Alert"("ownerId", "symbol", "type");
CREATE INDEX "Alert_enabled_type_nextEvaluationAt_idx" ON "Alert"("enabled", "type", "nextEvaluationAt");
CREATE INDEX "Alert_watchlistId_idx" ON "Alert"("watchlistId");
CREATE INDEX "Notes_ownerId_symbol_updatedAt_idx" ON "Notes"("ownerId", "symbol", "updatedAt");
CREATE UNIQUE INDEX "Watchlist_id_ownerId_key" ON "Watchlist"("id", "ownerId");

-- AddForeignKey
ALTER TABLE "ScannerCondition" ADD CONSTRAINT "ScannerCondition_scannerId_fkey" FOREIGN KEY ("scannerId") REFERENCES "SavedScanner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScannerRun" ADD CONSTRAINT "ScannerRun_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "UserSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScannerRun" ADD CONSTRAINT "ScannerRun_scannerId_fkey" FOREIGN KEY ("scannerId") REFERENCES "SavedScanner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScannerResult" ADD CONSTRAINT "ScannerResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScannerRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReadNewsArticle" ADD CONSTRAINT "ReadNewsArticle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "UserSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_watchlistId_ownerId_fkey" FOREIGN KEY ("watchlistId", "ownerId") REFERENCES "Watchlist"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;
