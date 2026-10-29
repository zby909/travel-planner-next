-- CreateTable
CREATE TABLE "Destination" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
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
    "budgetFlight" INTEGER NOT NULL,
    "budgetHotel" INTEGER NOT NULL,
    "budgetGroup" INTEGER NOT NULL,
    "budgetFood" INTEGER NOT NULL,
    "budgetTickets" INTEGER NOT NULL,
    "budgetTransport" INTEGER NOT NULL,
    "budgetOther" INTEGER NOT NULL,
    "groupText" TEXT NOT NULL,
    "flightNote" TEXT NOT NULL,
    "flightSource" TEXT,
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

-- CreateTable
CREATE TABLE "FlightPricing" (
    "destinationId" TEXT NOT NULL PRIMARY KEY,
    "route" TEXT NOT NULL,
    "normalMin" INTEGER NOT NULL,
    "normalMax" INTEGER NOT NULL,
    "holidayMin" INTEGER NOT NULL,
    "holidayMax" INTEGER NOT NULL,
    "normalSample" TEXT NOT NULL,
    "holidaySample" TEXT NOT NULL,
    CONSTRAINT "FlightPricing_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DestinationGuide" (
    "destinationId" TEXT NOT NULL PRIMARY KEY,
    "intro" TEXT NOT NULL,
    "pace" TEXT NOT NULL,
    "stay" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    CONSTRAINT "DestinationGuide_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuideDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guideId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "GuideDay_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "DestinationGuide" ("destinationId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FlightPriceSample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "route" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destinationName" TEXT NOT NULL,
    "departureDate" DATETIME,
    "returnDate" DATETIME,
    "tripNights" INTEGER,
    "pricePerPerson" INTEGER,
    "totalPrice" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "sourceType" TEXT NOT NULL,
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "airline" TEXT,
    "flightType" TEXT,
    "baggageIncluded" BOOLEAN,
    "baggageDetails" TEXT,
    "checkedAt" DATETIME,
    "notes" TEXT,
    "destinationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlightPriceSample_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VisitedPlace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "group" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "whenLabel" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "longitude" REAL,
    "latitude" REAL,
    "country" TEXT,
    "province" TEXT,
    "city" TEXT,
    "mapNote" TEXT
);

-- CreateTable
CREATE TABLE "TimelineEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "group" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "TimelinePlace" (
    "timelineEntryId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    PRIMARY KEY ("timelineEntryId", "placeId"),
    CONSTRAINT "TimelinePlace_timelineEntryId_fkey" FOREIGN KEY ("timelineEntryId") REFERENCES "TimelineEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimelinePlace_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "VisitedPlace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TravelPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "destinationId" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "plannedBudget" INTEGER,
    "actualBudget" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TravelPlan_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TravelPlanDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "date" DATETIME,
    "dayNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    CONSTRAINT "TravelPlanDay_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TravelPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountFen" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "spentAt" DATETIME,
    "paidBy" TEXT,
    "receiptPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TravelPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TravelMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "happenedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TravelMemory_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TravelPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TravelPhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT,
    "memoryId" TEXT,
    "filePath" TEXT NOT NULL,
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TravelPhoto_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TravelPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TravelPhoto_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "TravelMemory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Destination_rank_idx" ON "Destination"("rank");

-- CreateIndex
CREATE UNIQUE INDEX "GuideDay_guideId_sortOrder_key" ON "GuideDay"("guideId", "sortOrder");

-- CreateIndex
CREATE INDEX "FlightPriceSample_destinationId_idx" ON "FlightPriceSample"("destinationId");

-- CreateIndex
CREATE INDEX "FlightPriceSample_departureDate_returnDate_idx" ON "FlightPriceSample"("departureDate", "returnDate");

-- CreateIndex
CREATE INDEX "FlightPriceSample_sourceType_idx" ON "FlightPriceSample"("sourceType");

-- CreateIndex
CREATE INDEX "VisitedPlace_group_sortOrder_idx" ON "VisitedPlace"("group", "sortOrder");

-- CreateIndex
CREATE INDEX "TimelineEntry_year_sortOrder_idx" ON "TimelineEntry"("year", "sortOrder");

-- CreateIndex
CREATE INDEX "TimelinePlace_placeId_idx" ON "TimelinePlace"("placeId");

-- CreateIndex
CREATE INDEX "TravelPlan_status_startDate_idx" ON "TravelPlan"("status", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "TravelPlanDay_planId_dayNumber_key" ON "TravelPlanDay"("planId", "dayNumber");

-- CreateIndex
CREATE INDEX "Expense_planId_spentAt_idx" ON "Expense"("planId", "spentAt");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");

-- CreateIndex
CREATE INDEX "TravelPhoto_planId_sortOrder_idx" ON "TravelPhoto"("planId", "sortOrder");

-- CreateIndex
CREATE INDEX "TravelPhoto_memoryId_sortOrder_idx" ON "TravelPhoto"("memoryId", "sortOrder");
