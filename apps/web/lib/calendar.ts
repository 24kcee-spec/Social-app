export interface CalendarPlan {
  id: string;
  title: string;
  description: string;
  generalArea: string;
  startsAt: string;
  endsAt: string;
}
const escape = (value: string) =>
  value
    .replaceAll('\\', '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');
const date = (value: string) => {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error('Invalid calendar date.');
  return parsed
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
};
function fold(line: string) {
  const result: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > 74) {
      result.push(current);
      current = ' ';
      bytes = 1;
    }
    current += char;
    bytes += size;
  }
  result.push(current);
  return result.join('\r\n');
}
export function calendarFile(plan: CalendarPlan, origin: string, now = new Date()) {
  if (Date.parse(plan.endsAt) <= Date.parse(plan.startsAt))
    throw new Error('Invalid calendar duration.');
  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Sidle//Plans//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${escape(plan.id)}@sidle`,
      `DTSTAMP:${date(now.toISOString())}`,
      `DTSTART:${date(plan.startsAt)}`,
      `DTEND:${date(plan.endsAt)}`,
      `SUMMARY:${escape(plan.title)}`,
      `DESCRIPTION:${escape(plan.description)}`,
      `LOCATION:${escape(plan.generalArea)}`,
      `URL:${escape(new URL('/share/event/' + encodeURIComponent(plan.id), origin).href)}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .map(fold)
      .join('\r\n') + '\r\n'
  );
}
export function downloadCalendar(plan: CalendarPlan) {
  const url = URL.createObjectURL(
    new Blob([calendarFile(plan, location.origin)], { type: 'text/calendar;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sidle-plan.ics';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
