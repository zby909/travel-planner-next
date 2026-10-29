import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const [destinations, places, timeline, users, photos] = await Promise.all([
    db.destination.findMany(), db.visitedPlace.findMany(),
    db.timelineEntry.count(), db.user.count(), db.mediaAsset.count(),
  ]);
  const errors = [];
  for (const destination of destinations) {
    const sum = ["Flight", "Hotel", "Group", "Food", "Tickets", "Transport", "Other"]
      .reduce((total, key) => total + destination["budget" + key], 0);
    if (sum !== destination.pickBudget) errors.push(`Budget mismatch: ${destination.id}`);
  }
  for (const place of places) {
    if (place.latitude !== null && (place.latitude < -90 || place.latitude > 90))
      errors.push(`Invalid latitude: ${place.id}`);
    if (place.longitude !== null && (place.longitude < -180 || place.longitude > 180))
      errors.push(`Invalid longitude: ${place.id}`);
  }
  console.log(JSON.stringify({
    destinations: destinations.length, visitedPlaces: places.length,
    timelineEntries: timeline, users, mediaAssets: photos, errors,
  }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally { await db.$disconnect(); }
