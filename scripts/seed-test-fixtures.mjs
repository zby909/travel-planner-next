import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  // Synthetic fixture: no private travel records are used in GitHub Actions.
  await db.destination.create({
    data: {
      id: "test-island", title: "示例岛屿", subtitle: "虚构的测试地点", flag: "🏝️",
      kind: "旅行规划", typesJson: "[]", months: "全年", seasonsJson: "[]", days: "3天",
      minBudget: 1000, maxBudget: 1500, pickBudget: 1300, rank: 1,
      budgetFlight: 300, budgetHotel: 300, budgetGroup: 0, budgetFood: 250,
      budgetTickets: 150, budgetTransport: 200, budgetOther: 100,
      groupText: "", flightNote: "", vibe: "轻松慢游", reason: "虚构示例",
      spotsJson: "[]", routeJson: "[]",
    },
  });
  await db.visitedPlace.create({
    data: {
      id: "test-town", name: "示例小镇", region: "虚构测试地区",
      image: "images/place-placeholder.svg", group: "mine",
      whenLabel: "2025", sortOrder: 0, longitude: 110, latitude: 30,
    },
  });
  console.log("Test fixtures: 1 destination, 1 place (no private records).");
} finally { await db.$disconnect(); }
