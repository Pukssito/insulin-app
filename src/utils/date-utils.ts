export function toYmdLocal(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function minutesNowLocal(d = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function formatRange(startMin: number, endMin: number): string {
  const f = (m: number) => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  return `${f(startMin)}–${f(endMin)}`;
}
