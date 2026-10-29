import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

type LegacyTrip = {
  id: string; title: string; sub: string; flag?: string; kind?: string;
  types?: string[]; months?: string; seasons?: string[]; days?: string;
  min?: number; max?: number; pick?: number; rank?: number;
  budget?: Record<string, number>;
  groupText?: string; flightNote?: string; flightSource?: string;
  vibe?: string; reason?: string; spots?: string[]; route?: string[];
  warning?: string; style?: string; badge?: string;
  flightPricing?: { route?: string; normal?: number[]; holiday?: number[]; normalSample?: string; holidaySample?: string };
};
type LegacyGuide = {
  intro?: string; pace?: string; stay?: string; transport?: string;
  days?: { day?: string; title?: string; detail?: string }[];
};
type LegacyPlace = { id: string; group: string; name: string; region: string; image: string; when?: string };
type LegacyTimeline = { date: string; year: number; group: string; title: string; note?: string; placeIds?: string[] };
type LegacyJournal = { places: LegacyPlace[]; timeline: LegacyTimeline[] };
type LegacyMap = {
  coords: Record<string, [number, number]>;
  regions: Record<string, [string | null, string | null, string | null]>;
  notes: Record<string, string>;
};

const prisma = new PrismaClient();

function loadLegacy(fileName: string): Record<string, unknown> {
  const context: { window: Record<string, unknown>; document: { getElementById: () => null }; console: Console } = {
    window: {},
    document: { getElementById: () => null },
    console,
  };
  const filePath = resolve(process.cwd(), "prisma", "seed-data", fileName);
  runInNewContext(readFileSync(filePath, "utf8"), context);
  return context.window;
}

async function main() {
  const tripData = loadLegacy("trip-data.js");
  const guideData = loadLegacy("trip-guides.js");
  const journalData = loadLegacy("visited-data.js");
  const mapData = loadLegacy("visited-map.js");
  const trips = tripData.TRIPS as LegacyTrip[];
  const guides = guideData.TRIP_GUIDES as Record<string, LegacyGuide>;
  const journal = journalData.VISITED_JOURNAL as LegacyJournal;
  const map = mapData.TRAVEL_MAP_CONFIG as LegacyMap;

  if (!trips?.length || !journal?.places?.length || !journal?.timeline?.length || !map?.coords) {
    throw new Error("Legacy seed data incomplete; refusing to seed an empty database.");
  }

  for (const trip of trips) {
    const budget = trip.budget ?? {};
    await prisma.destination.upsert({
      where: { id: trip.id },
      create: {
        id: trip.id,
        title: trip.title,
        subtitle: trip.sub,
        flag: trip.flag ?? "✈️",
        kind: trip.kind ?? "",
        typesJson: JSON.stringify(trip.types ?? []),
        months: trip.months ?? "",
        seasonsJson: JSON.stringify(trip.seasons ?? []),
        days: trip.days ?? "",
        minBudget: trip.min ?? 0,
        maxBudget: trip.max ?? 0,
        pickBudget: trip.pick ?? 0,
        rank: trip.rank ?? 0,
        budgetFlight: budget.flight ?? 0,
        budgetHotel: budget.hotel ?? 0,
        budgetGroup: budget.group ?? 0,
        budgetFood: budget.food ?? 0,
        budgetTickets: budget.tickets ?? 0,
        budgetTransport: budget.transport ?? 0,
        budgetOther: budget.other ?? 0,
        groupText: trip.groupText ?? "",
        flightNote: trip.flightNote ?? "",
        flightSource: trip.flightSource ?? null,
        vibe: trip.vibe ?? "",
        reason: trip.reason ?? "",
        spotsJson: JSON.stringify(trip.spots ?? []),
        routeJson: JSON.stringify(trip.route ?? []),
        warning: trip.warning ?? null,
        style: trip.style ?? null,
        badge: trip.badge ?? null,
      },
      update: {
        title: trip.title,
        subtitle: trip.sub,
        flag: trip.flag ?? "✈️",
        kind: trip.kind ?? "",
        typesJson: JSON.stringify(trip.types ?? []),
        months: trip.months ?? "",
        seasonsJson: JSON.stringify(trip.seasons ?? []),
        days: trip.days ?? "",
        minBudget: trip.min ?? 0,
        maxBudget: trip.max ?? 0,
        pickBudget: trip.pick ?? 0,
        rank: trip.rank ?? 0,
        budgetFlight: budget.flight ?? 0,
        budgetHotel: budget.hotel ?? 0,
        budgetGroup: budget.group ?? 0,
        budgetFood: budget.food ?? 0,
        budgetTickets: budget.tickets ?? 0,
        budgetTransport: budget.transport ?? 0,
        budgetOther: budget.other ?? 0,
        groupText: trip.groupText ?? "",
        flightNote: trip.flightNote ?? "",
        flightSource: trip.flightSource ?? null,
        vibe: trip.vibe ?? "",
        reason: trip.reason ?? "",
        spotsJson: JSON.stringify(trip.spots ?? []),
        routeJson: JSON.stringify(trip.route ?? []),
        warning: trip.warning ?? null,
        style: trip.style ?? null,
        badge: trip.badge ?? null,
      },
    });

    if (trip.flightPricing) {
      const flight = trip.flightPricing;
      await prisma.flightPricing.upsert({
        where: { destinationId: trip.id },
        create: {
          destinationId: trip.id,
          route: flight.route ?? "",
          normalMin: flight.normal?.[0] ?? 0,
          normalMax: flight.normal?.[1] ?? 0,
          holidayMin: flight.holiday?.[0] ?? 0,
          holidayMax: flight.holiday?.[1] ?? 0,
          normalSample: flight.normalSample ?? "",
          holidaySample: flight.holidaySample ?? "",
        },
        update: {
          route: flight.route ?? "",
          normalMin: flight.normal?.[0] ?? 0,
          normalMax: flight.normal?.[1] ?? 0,
          holidayMin: flight.holiday?.[0] ?? 0,
          holidayMax: flight.holiday?.[1] ?? 0,
          normalSample: flight.normalSample ?? "",
          holidaySample: flight.holidaySample ?? "",
        },
      });
    }

    const guide = guides[trip.id];
    if (guide) {
      await prisma.destinationGuide.upsert({
        where: { destinationId: trip.id },
        create: {
          destinationId: trip.id,
          intro: guide.intro ?? "",
          pace: guide.pace ?? "",
          stay: guide.stay ?? "",
          transport: guide.transport ?? "",
        },
        update: {
          intro: guide.intro ?? "",
          pace: guide.pace ?? "",
          stay: guide.stay ?? "",
          transport: guide.transport ?? "",
        },
      });
      for (const [index, day] of (guide.days ?? []).entries()) {
        const id = `${trip.id}-day-${index + 1}`;
        await prisma.guideDay.upsert({
          where: { id },
          create: {
            id,
            guideId: trip.id,
            day: day.day ?? `D${index + 1}`,
            title: day.title ?? "",
            detail: day.detail ?? "",
            sortOrder: index,
          },
          update: {
            guideId: trip.id,
            day: day.day ?? `D${index + 1}`,
            title: day.title ?? "",
            detail: day.detail ?? "",
            sortOrder: index,
          },
        });
      }
    }
  }

  for (const [index, place] of journal.places.entries()) {
    const [longitude, latitude] = map.coords[place.id] ?? [null, null];
    const [country, province, city] = map.regions[place.id] ?? [null, null, null];
    const values = {
      group: place.group,
      name: place.name,
      region: place.region,
      image: place.image,
      whenLabel: place.when ?? "",
      sortOrder: index,
      longitude: longitude ?? null,
      latitude: latitude ?? null,
      country: country ?? null,
      province: province ?? null,
      city: city ?? null,
      mapNote: map.notes[place.id] ?? map.notes.default ?? null,
    };
    await prisma.visitedPlace.upsert({
      where: { id: place.id },
      create: { id: place.id, ...values },
      update: values,
    });
  }

  for (const [index, event] of journal.timeline.entries()) {
    const id = `legacy-${event.year}-${String(index + 1).padStart(3, "0")}`;
    await prisma.timelineEntry.upsert({
      where: { id },
      create: {
        id,
        date: String(event.date),
        year: event.year,
        group: event.group,
        title: event.title,
        note: event.note ?? "",
        sortOrder: index,
      },
      update: {
        date: String(event.date),
        year: event.year,
        group: event.group,
        title: event.title,
        note: event.note ?? "",
        sortOrder: index,
      },
    });
    await prisma.timelinePlace.deleteMany({ where: { timelineEntryId: id } });
    for (const [placeIndex, placeId] of (event.placeIds ?? []).entries()) {
      if (journal.places.some((place) => place.id === placeId)) {
        await prisma.timelinePlace.create({
          data: { timelineEntryId: id, placeId, sortOrder: placeIndex },
        });
      }
    }
  }

  await prisma.flightPriceSample.upsert({
    where: { id: "user-sample-guangzhou-urumqi-2026-11" },
    create: {
      id: "user-sample-guangzhou-urumqi-2026-11",
      route: "广州往返乌鲁木齐",
      origin: "广州",
      destinationName: "乌鲁木齐",
      departureDate: new Date("2026-11-11T00:00:00.000Z"),
      returnDate: new Date("2026-11-18T00:00:00.000Z"),
      tripNights: 7,
      pricePerPerson: 2000,
      totalPrice: 4000,
      currency: "CNY",
      sourceType: "USER_REPORTED",
      sourceName: "用户手动查询",
      notes: "用户提供的往返票价样本，约2000元/人、两人约4000元。查询时间、航司、直飞/中转和行李政策未单独确认；此记录不是当前可购买报价。",
    },
    update: {
      route: "广州往返乌鲁木齐",
      origin: "广州",
      destinationName: "乌鲁木齐",
      departureDate: new Date("2026-11-11T00:00:00.000Z"),
      returnDate: new Date("2026-11-18T00:00:00.000Z"),
      tripNights: 7,
      pricePerPerson: 2000,
      totalPrice: 4000,
      currency: "CNY",
      sourceType: "USER_REPORTED",
      sourceName: "用户手动查询",
      notes: "用户提供的往返票价样本，约2000元/人、两人约4000元。查询时间、航司、直飞/中转和行李政策未单独确认；此记录不是当前可购买报价。",
    },
  });

  await prisma.appSetting.upsert({
    where: { key: "legacy_seed_v1" },
    create: { key: "legacy_seed_v1", value: "completed" },
    update: { value: "completed" },
  });

  const counts = {
    destinations: await prisma.destination.count(),
    guides: await prisma.destinationGuide.count(),
    guideDays: await prisma.guideDay.count(),
    visitedPlaces: await prisma.visitedPlace.count(),
    timelineEntries: await prisma.timelineEntry.count(),
    flightPriceSamples: await prisma.flightPriceSample.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
