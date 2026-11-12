export type SwipeDestination = "controls" | "home" | null;

export function swipeDestination({
  delta,
  view,
  scrollDelta,
}: {
  delta: number;
  view: string;
  scrollDelta: number;
}): SwipeDestination {
  if (Math.abs(scrollDelta) > 2) return null;
  if (delta < -48 && view === "home") return "controls";
  if (delta > 48 && view === "controls") return "home";
  return null;
}
