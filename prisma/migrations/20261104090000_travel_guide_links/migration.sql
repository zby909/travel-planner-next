-- Store links to externally deployed AI travel guides without copying their HTML files.
CREATE TABLE "TravelGuideLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "dayDate" DATETIME,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "coverImage" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TravelGuideLink_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TravelPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TravelGuideLink_planId_dayDate_sortOrder_idx" ON "TravelGuideLink"("planId", "dayDate", "sortOrder");
