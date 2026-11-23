import { dateKeyFromLabel, getVisitDate } from "@/lib/place-visits";

type PlaceLink = { id: string; name: string; image: string; coverX: number; coverY: number };
type Visit = { id: string; group: string | null; title: string; content: string; happenedAt: Date | null; whenLabel: string };
type Place = PlaceLink & { visits: Visit[] };
type Event = { id: string; date: string; year: number; group: string; title: string; note: string; sortOrder: number; places: { place: PlaceLink }[] };

type TimelineItem = {
  id: string;
  title: string;
  date: string;
  dateTime?: string;
  group: string | null;
  note: string;
  places: PlaceLink[];
  visitId?: string;
  key: number;
  year: number;
  order: number;
};

// 每次到访与每条独立事件都有自己的编号，同日同名的记录也分别呈现。
export function buildVisitTimeline(places: Place[], events: Event[]) {
  const visits: TimelineItem[] = places.flatMap(place => place.visits.map(visit => {
    const date = getVisitDate(visit);
    return {
      id: `visit-${visit.id}`, visitId: visit.id, title: visit.title || place.name, date: date.label, dateTime: date.dateTime,
      group: visit.group, note: visit.content, places: [place], key: date.key, year: Math.floor(date.key / 10000), order: 0,
    };
  }));
  const entries: TimelineItem[] = events.map(event => {
    const linkedPlaces = event.places.map(link => link.place);
    const key = dateKeyFromLabel(event.date);
    return {
      id: `event-${event.id}`, title: event.title, date: event.date, group: event.group,
      note: event.note, places: linkedPlaces, key: key || event.year * 10000, year: event.year, order: event.sortOrder,
    };
  });
  const years = new Map<number, TimelineItem[]>();
  for (const item of [...visits, ...entries].sort((a, b) => b.year - a.year || b.key - a.key || a.order - b.order || a.id.localeCompare(b.id))) {
    const group = years.get(item.year);
    if (group) group.push(item);
    else years.set(item.year, [item]);
  }
  return [...years.entries()];
}
