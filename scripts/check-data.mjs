import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const [destinations, places, timeline, users, assets, plans, expenses, memories, photos] = await Promise.all([
    db.destination.findMany(), db.visitedPlace.findMany(),
    db.timelineEntry.count(), db.user.count(), db.mediaAsset.count(),
    db.travelPlan.count(), db.expense.findMany({ select: { id: true, amountMinor: true } }),
    db.travelMemory.count({ where: { deletedAt: null } }), db.travelPhoto.count(),
  ]);
  const errors = [];
  for (const destination of destinations) {
    const sum = destination.budgetAccommodation + destination.budgetFood
      + destination.budgetTransport + destination.budgetOther;
    if (sum !== destination.pickBudget) errors.push(`Budget mismatch: ${destination.id}`);
  }
  for (const place of places) {
    if (place.latitude !== null && (place.latitude < -90 || place.latitude > 90))
      errors.push(`Invalid latitude: ${place.id}`);
    if (place.longitude !== null && (place.longitude < -180 || place.longitude > 180))
      errors.push(`Invalid longitude: ${place.id}`);
  }
  for (const expense of expenses) {
    if (expense.amountMinor <= 0) errors.push(`Invalid expense amount: ${expense.id}`);
  }
  console.log(JSON.stringify({
    destinations: destinations.length, visitedPlaces: places.length,
    timelineEntries: timeline, travelPlans: plans, expenses: expenses.length,
    activeMemories: memories, travelPhotos: photos, users, mediaAssets: assets, errors,
  }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally { await db.$disconnect(); }
