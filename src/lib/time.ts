export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
export const SLOT_STEP_MIN = 60

export function toIsoDate(year: number, monthIndex: number, day: number) {
  const mm = String(monthIndex + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

export function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function minutesToLabel(mins: number) {
  const h24 = Math.floor(mins / 60)
  const m = mins % 60
  const period = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

/** Parses a "9:00 AM"-style label back into minutes-since-midnight. */
export function labelMinutes(label: string) {
  const match = label.match(/(\d+):(\d+) (AM|PM)/)
  if (!match) return 0
  let h = Number(match[1])
  const m = Number(match[2])
  const period = match[3]
  if (period === 'PM' && h !== 12) h += 12
  if (period === 'AM' && h === 12) h = 0
  return h * 60 + m
}

export function generateSlots(startTime: string, endTime: string) {
  const start = timeToMinutes(startTime)
  const end = timeToMinutes(endTime)
  const slots: number[] = []
  for (let t = start; t + SLOT_STEP_MIN <= end; t += SLOT_STEP_MIN) slots.push(t)
  return slots
}
