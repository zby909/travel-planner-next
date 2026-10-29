import { existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const [destinations, guides, guideDays, places, timeline, samples] = await Promise.all([
    prisma.destination.findMany({ include: { flightPricing: true } }),
    prisma.destinationGuide.count(),
    prisma.guideDay.count(),
    prisma.visitedPlace.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.timelineEntry.findMany({ include: { places: true } }),
    prisma.flightPriceSample.findMany(),
  ]);

  const errors = [];
  if (destinations.length !== 14) errors.push(`expected 14 destinations, got ${destinations.length}`);
  if (guides !== 14) errors.push(`expected 14 guides, got ${guides}`);
  if (guideDays !== 88) errors.push(`expected 88 guide days, got ${guideDays}`);
  if (places.length !== 31) errors.push(`expected 31 visited places, got ${places.length}`);
  if (timeline.length !== 25) errors.push(`expected 25 timeline entries, got ${timeline.length}`);
  if (samples.length < 1) errors.push("flight price sample missing");

  for (const destination of destinations) {
    const sum = destination.budgetFlight + destination.budgetHotel + destination.budgetGroup +
      destination.budgetFood + destination.budgetTickets + destination.budgetTransport + destination.budgetOther;
    if (sum !== destination.pickBudget) errors.push(`${destination.id}: budget components ${sum} != pick ${destination.pickBudget}`);
    if (!destination.flightPricing) errors.push(`${destination.id}: flight pricing missing`);
    if (!existsSync(join(process.cwd(), "public", "images", `${destination.id}-0.jpg`))) {
      errors.push(`${destination.id}: hero image missing`);
    }
  }

  for (const place of places) {
    const assetPath = join(process.cwd(), "public", place.image.replace(/^\//, ""));
    if (!existsSync(assetPath)) errors.push(`${place.id}: image missing at ${place.image}`);
    if (place.longitude === null || place.latitude === null) errors.push(`${place.id}: map coordinates missing`);
  }

  for (const event of timeline) {
    if (event.places.length === 0) errors.push(`${event.id}: timeline event has no place links`);
  }

  console.log(JSON.stringify({
    destinations: destinations.length,
    guides,
    guideDays,
    visitedPlaces: places.length,
    timelineEntries: timeline.length,
    flightSamples: samples.length,
    mappedPlaces: places.filter((place) => place.longitude !== null && place.latitude !== null).length,
    errors,
  }, null, 2));

  if (errors.length) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
