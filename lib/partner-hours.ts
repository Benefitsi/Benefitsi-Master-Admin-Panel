const minutesPerDay = 24 * 60
const minutesPerWeek = 7 * minutesPerDay

function timeMinutes(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value)
  return match ? Number(match[1]) * 60 + Number(match[2]) + Number(match[3] ?? 0) / 60 : null
}

// A closing time before opening belongs to the following calendar day.
// Midnight to midnight is a full day; other equal times are ambiguous.
export function openingHourInterval(opens: string, closes: string) {
  const start = timeMinutes(opens), close = timeMinutes(closes)
  if (start === null || close === null || start === close && start !== 0) return null
  return { start, end: close <= start ? close + minutesPerDay : close }
}

type WeeklyRange = { weekday: number | null; opens_at: string | null; closes_at: string | null; is_closed: boolean | null }

export function overlappingOpeningHours(rows: WeeklyRange[]) {
  const ranges = rows.flatMap(row => {
    if (row.is_closed || row.weekday === null || !row.opens_at || !row.closes_at) return []
    const interval = openingHourInterval(row.opens_at, row.closes_at)
    if (!interval) return []
    const offset = (row.weekday - 1) * minutesPerDay
    return [{ weekday: row.weekday, start: offset + interval.start, end: offset + interval.end }]
  })
  for (let first = 0; first < ranges.length; first++) {
    for (let second = first + 1; second < ranges.length; second++) {
      for (const offset of [-minutesPerWeek, 0, minutesPerWeek]) {
        if (ranges[first].start < ranges[second].end + offset && ranges[second].start + offset < ranges[first].end) {
          return ranges[first].weekday
        }
      }
    }
  }
  return null
}
