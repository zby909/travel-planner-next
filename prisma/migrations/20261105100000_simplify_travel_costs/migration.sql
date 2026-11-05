-- Consolidate destination budgets and expense records into four broad categories.
-- Existing values are preserved: flights join transport; group/tickets join other.
DROP INDEX "FlightPriceSample_sourceType_idx";
DROP INDEX "FlightPriceSample_departureDate_returnDate_idx";
DROP INDEX "FlightPriceSample_destinationId_idx";

PRAGMA foreign_keys=off;
DROP TABLE "FlightPriceSample";
PRAGMA foreign_keys=on;

PRAGMA foreign_keys=off;
DROP TABLE "FlightPricing";
PRAGMA foreign_keys=on;

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Destination" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "imagePath" TEXT,
    "flag" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "typesJson" TEXT NOT NULL,
    "months" TEXT NOT NULL,
    "seasonsJson" TEXT NOT NULL,
    "days" TEXT NOT NULL,
    "minBudget" INTEGER NOT NULL,
    "maxBudget" INTEGER NOT NULL,
    "pickBudget" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "budgetAccommodation" INTEGER NOT NULL,
    "budgetFood" INTEGER NOT NULL,
    "budgetTransport" INTEGER NOT NULL,
    "budgetOther" INTEGER NOT NULL,
    "groupText" TEXT NOT NULL,
    "vibe" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "spotsJson" TEXT NOT NULL,
    "routeJson" TEXT NOT NULL,
    "warning" TEXT,
    "style" TEXT,
    "badge" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Destination" (
    "id", "title", "subtitle", "imagePath", "flag", "kind", "typesJson", "months", "seasonsJson", "days",
    "minBudget", "maxBudget", "pickBudget", "rank", "budgetAccommodation", "budgetFood", "budgetTransport",
    "budgetOther", "groupText", "vibe", "reason", "spotsJson", "routeJson", "warning", "style", "badge",
    "createdAt", "updatedAt"
)
SELECT
    "id", "title", "subtitle", "imagePath", "flag", "kind", "typesJson", "months", "seasonsJson", "days",
    "minBudget", "maxBudget", "pickBudget", "rank", "budgetHotel", "budgetFood",
    "budgetTransport" + "budgetFlight", "budgetOther" + "budgetGroup" + "budgetTickets",
    "groupText", "vibe", "reason", "spotsJson", "routeJson", "warning", "style", "badge", "createdAt", "updatedAt"
FROM "Destination";
DROP TABLE "Destination";
ALTER TABLE "new_Destination" RENAME TO "Destination";
CREATE INDEX "Destination_rank_idx" ON "Destination"("rank");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

UPDATE "Expense"
SET "category" = CASE
    WHEN "category" = 'FLIGHT' THEN 'TRANSPORT'
    WHEN "category" = 'HOTEL' THEN 'ACCOMMODATION'
    ELSE "category"
END;
