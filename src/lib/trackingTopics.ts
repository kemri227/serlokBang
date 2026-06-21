const CELL_SIZE = 0.1;

function cell(value: number) {
  return Math.floor(value / CELL_SIZE);
}

export function trackingTopic(kind: "vehicle" | "passenger", lat: number, lng: number) {
  return `tracking:${kind}:${cell(lat)}:${cell(lng)}`;
}

export function nearbyTrackingTopics(kind: "vehicle" | "passenger", lat: number, lng: number) {
  const latCell = cell(lat);
  const lngCell = cell(lng);
  const topics: string[] = [];
  for (let y = -1; y <= 1; y += 1) {
    for (let x = -1; x <= 1; x += 1) topics.push(`tracking:${kind}:${latCell + y}:${lngCell + x}`);
  }
  return topics;
}

