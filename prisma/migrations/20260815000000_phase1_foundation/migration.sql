-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('PRICE', 'PERCENT_CHANGE', 'RELATIVE_VOLUME', 'NEWS', 'EVENT', 'TECHNICAL');

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL DEFAULT 'primary',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "defaultWatchlistId" TEXT,
    "defaultWorkspaceId" TEXT,
    "chartDefaults" JSONB,
    "preferredIndicators" JSONB,
    "scannerDefaults" JSONB,
    "newsFilters" JSONB,
    "eventFilters" JSONB,
    "refreshPreferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'primary',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WatchlistTicker" (
    "id" TEXT NOT NULL,
    "watchlistId" TEXT NOT NULL,
    "symbol" VARCHAR(15) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchlistTicker_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedScanner" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'primary',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "definition" JSONB NOT NULL,
    "isPreset" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SavedScanner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'primary',
    "name" TEXT,
    "type" "AlertType" NOT NULL,
    "symbol" VARCHAR(15),
    "configuration" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedWorkspace" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'primary',
    "name" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SavedWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CachedSecurityMetadata" (
    "symbol" VARCHAR(15) NOT NULL,
    "payload" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CachedSecurityMetadata_pkey" PRIMARY KEY ("symbol")
);

CREATE TABLE "Notes" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'primary',
    "symbol" VARCHAR(15) NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSettings_defaultWatchlistId_idx" ON "UserSettings"("defaultWatchlistId");
CREATE INDEX "UserSettings_defaultWorkspaceId_idx" ON "UserSettings"("defaultWorkspaceId");
CREATE INDEX "Watchlist_ownerId_position_idx" ON "Watchlist"("ownerId", "position");
CREATE UNIQUE INDEX "Watchlist_ownerId_name_key" ON "Watchlist"("ownerId", "name");
CREATE INDEX "WatchlistTicker_symbol_idx" ON "WatchlistTicker"("symbol");
CREATE INDEX "WatchlistTicker_watchlistId_position_idx" ON "WatchlistTicker"("watchlistId", "position");
CREATE UNIQUE INDEX "WatchlistTicker_watchlistId_symbol_key" ON "WatchlistTicker"("watchlistId", "symbol");
CREATE INDEX "SavedScanner_ownerId_updatedAt_idx" ON "SavedScanner"("ownerId", "updatedAt");
CREATE UNIQUE INDEX "SavedScanner_ownerId_name_key" ON "SavedScanner"("ownerId", "name");
CREATE INDEX "Alert_ownerId_enabled_idx" ON "Alert"("ownerId", "enabled");
CREATE INDEX "Alert_enabled_type_idx" ON "Alert"("enabled", "type");
CREATE INDEX "Alert_symbol_idx" ON "Alert"("symbol");
CREATE INDEX "SavedWorkspace_ownerId_updatedAt_idx" ON "SavedWorkspace"("ownerId", "updatedAt");
CREATE UNIQUE INDEX "SavedWorkspace_ownerId_name_key" ON "SavedWorkspace"("ownerId", "name");
CREATE INDEX "CachedSecurityMetadata_expiresAt_idx" ON "CachedSecurityMetadata"("expiresAt");
CREATE INDEX "CachedSecurityMetadata_source_asOf_idx" ON "CachedSecurityMetadata"("source", "asOf");
CREATE INDEX "Notes_ownerId_updatedAt_idx" ON "Notes"("ownerId", "updatedAt");
CREATE INDEX "Notes_ownerId_symbol_idx" ON "Notes"("ownerId", "symbol");
CREATE INDEX "Notes_symbol_updatedAt_idx" ON "Notes"("symbol", "updatedAt");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_defaultWatchlistId_fkey" FOREIGN KEY ("defaultWatchlistId") REFERENCES "Watchlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_defaultWorkspaceId_fkey" FOREIGN KEY ("defaultWorkspaceId") REFERENCES "SavedWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "UserSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WatchlistTicker" ADD CONSTRAINT "WatchlistTicker_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "Watchlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedScanner" ADD CONSTRAINT "SavedScanner_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "UserSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "UserSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedWorkspace" ADD CONSTRAINT "SavedWorkspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "UserSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notes" ADD CONSTRAINT "Notes_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "UserSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
