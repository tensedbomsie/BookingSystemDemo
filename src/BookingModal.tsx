import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { X, ChevronLeft, ChevronRight, ArrowLeft, Clock, CheckCircle2, User, Phone } from 'lucide-react'
import { supabase } from './lib/supabase'
import { DAY_LABELS, MONTH_LABELS, toIsoDate, minutesToLabel, labelMinutes, generateSlots } from './lib/time'

/*
 * BookingModal — real appointment booking flow backed by Supabase.
 *
 * Reads `booking_hours` + `booking_blocked_dates` + the `booking_availability`
 * view (public-safe: date/time only, no customer PII) to compute real
 * open slots, and inserts a real row into `bookings` on confirm.
 *
 * Drop this file (plus src/lib/time.ts, src/lib/supabase.ts, and the
 * .cal-cell / .modal-overlay / .modal-panel / .field-input / .btn-primary /
 * .btn-ghost utilities from styles.css) into any client site and it
 * inherits that site's --color-* variables automatically.
 */

type Step = 'calendar' | 'time' | 'form' | 'confirmed'

type BusinessHour = { day_of_week: number; is_open: boolean; start_time: string; end_time: string }

function buildMonthGrid(year: number, monthIndex: number) {
  const firstWeekday = new Date(year, monthIndex, 1).getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const cells: Array<{ day: number; weekday: number } | null> = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, weekday: (firstWeekday + day - 1) % 7 })
  }
  return cells
}

export default function BookingModal({
  open,
  onClose,
  businessName = 'this business',
}: {
  open: boolean
  onClose: () => void
  businessName?: string
}) {
  const today = useMemo(() => new Date(), [])
  const [step, setStep] = useState<Step>('calendar')
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  const [hoursByDay, setHoursByDay] = useState<Record<number, BusinessHour> | null>(null)
  const [blockedDates, setBlockedDates] = useState<Set<string>>(new Set())
  const [takenByDate, setTakenByDate] = useState<Record<string, Set<string>>>({})
  const [loadingBase, setLoadingBase] = useState(true)
  const [loadingMonth, setLoadingMonth] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Fetch business hours + blocked dates once when the modal first opens.
  useEffect(() => {
    if (!open || hoursByDay) return
    setLoadingBase(true)
    Promise.all([
      supabase.from('booking_hours').select('day_of_week, is_open, start_time, end_time'),
      supabase.from('booking_blocked_dates').select('date'),
    ])
      .then(([hoursRes, blockedRes]) => {
        if (hoursRes.error) throw hoursRes.error
        if (blockedRes.error) throw blockedRes.error
        const map: Record<number, BusinessHour> = {}
        for (const row of hoursRes.data ?? []) map[row.day_of_week] = row
        setHoursByDay(map)
        setBlockedDates(new Set((blockedRes.data ?? []).map((r) => r.date)))
      })
      .catch((err) => setErrorMsg(err.message ?? 'Could not load availability.'))
      .finally(() => setLoadingBase(false))
  }, [open, hoursByDay])

  // Fetch which slots are already taken for the visible month.
  useEffect(() => {
    if (!open) return
    setLoadingMonth(true)
    const first = toIsoDate(viewYear, viewMonth, 1)
    const last = toIsoDate(viewYear, viewMonth, new Date(viewYear, viewMonth + 1, 0).getDate())
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('booking_availability')
          .select('booking_date, booking_time')
          .gte('booking_date', first)
          .lte('booking_date', last)
        if (error) throw error
        const map: Record<string, Set<string>> = {}
        for (const row of data ?? []) {
          if (!map[row.booking_date]) map[row.booking_date] = new Set()
          map[row.booking_date].add(row.booking_time)
        }
        setTakenByDate(map)
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Could not load booked times.')
      } finally {
        setLoadingMonth(false)
      }
    })()
  }, [open, viewYear, viewMonth])

  const cells = buildMonthGrid(viewYear, viewMonth)
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth()
  const selectedIso = selectedDay != null ? toIsoDate(viewYear, viewMonth, selectedDay) : null

  const availableSlotsForSelectedDay = useMemo(() => {
    if (!hoursByDay || selectedDay == null || !selectedIso) return []
    const cell = cells.find((c) => c?.day === selectedDay)
    if (!cell) return []
    const hours = hoursByDay[cell.weekday]
    if (!hours?.is_open) return []
    const takenSet = takenByDate[selectedIso] ?? new Set<string>()
    const isToday = isCurrentMonth && selectedDay === today.getDate()
    const nowMin = today.getHours() * 60 + today.getMinutes()

    return generateSlots(hours.start_time, hours.end_time)
      .map(minutesToLabel)
      .filter((label) => !takenSet.has(label))
      .filter((label) => {
        if (!isToday) return true
        return labelMinutes(label) > nowMin
      })
  }, [hoursByDay, selectedDay, selectedIso, takenByDate, cells, isCurrentMonth, today])

  if (!open) return null

  function isDayAvailable(day: number, weekday: number) {
    if (!hoursByDay) return false
    const isPast = isCurrentMonth && day < today.getDate()
    if (isPast) return false
    const hours = hoursByDay[weekday]
    if (!hours?.is_open) return false
    const iso = toIsoDate(viewYear, viewMonth, day)
    if (blockedDates.has(iso)) return false
    const totalSlots = generateSlots(hours.start_time, hours.end_time).length
    const taken = takenByDate[iso]?.size ?? 0
    return taken < totalSlots
  }

  function reset() {
    setStep('calendar')
    setSelectedDay(null)
    setSelectedTime(null)
    setName('')
    setPhone('')
    setErrorMsg(null)
  }

  function handleClose() {
    onClose()
    setTimeout(reset, 250)
  }

  function goPrevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  function goNextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault()
    if (!selectedIso || !selectedTime) return
    setSubmitting(true)
    setErrorMsg(null)

    // Booking is always free/instant at this step — jobs that need an
    // upfront price (most service businesses have to see the scope first)
    // get a Stripe payment link sent by the owner afterward, from the
    // Dashboard's "Request Payment" action, not forced here at a flat rate.
    const { error } = await supabase.from('bookings').insert({
      customer_name: name,
      customer_phone: phone,
      booking_date: selectedIso,
      booking_time: selectedTime,
      status: 'confirmed',
      payment_status: 'not_required',
    })
    setSubmitting(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    setStep('confirmed')
  }

  const selectedDateLabel = selectedDay != null ? `${MONTH_LABELS[viewMonth]} ${selectedDay}, ${viewYear}` : ''

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Book an appointment</p>
            <p className="text-sm font-semibold text-foreground">{businessName}</p>
          </div>
          <button onClick={handleClose} className="btn-ghost h-9 w-9 rounded-full p-0" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {errorMsg && (
            <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {errorMsg}
            </div>
          )}

          {step === 'calendar' && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <button onClick={goPrevMonth} className="btn-ghost h-8 w-8 rounded-full p-0" aria-label="Previous month">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="font-semibold text-foreground">
                  {MONTH_LABELS[viewMonth]} {viewYear}
                </span>
                <button onClick={goNextMonth} className="btn-ghost h-8 w-8 rounded-full p-0" aria-label="Next month">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {loadingBase || loadingMonth ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Loading availability…</p>
              ) : (
                <>
                  <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-muted-foreground">
                    {DAY_LABELS.map((d) => (
                      <div key={d} className="py-1">{d}</div>
                    ))}
                  </div>
                  <div className="mt-1 grid grid-cols-7 gap-1.5">
                    {cells.map((cell, i) => {
                      if (!cell) return <div key={`blank-${i}`} />
                      const { day, weekday } = cell
                      const available = isDayAvailable(day, weekday)
                      const isSelected = selectedDay === day

                      return (
                        <button
                          key={day}
                          disabled={!available}
                          onClick={() => {
                            setSelectedDay(day)
                            setStep('time')
                          }}
                          className="cal-cell"
                          style={{
                            backgroundColor: isSelected ? 'transparent' : available ? 'var(--color-secondary)' : 'transparent',
                            borderColor: isSelected ? 'var(--color-primary)' : 'transparent',
                            color: available ? 'var(--color-foreground)' : 'var(--color-muted-foreground)',
                            opacity: available ? 1 : 0.4,
                            cursor: available ? 'pointer' : 'not-allowed',
                          }}
                        >
                          <span>{day}</span>
                          {available && <span className="h-1 w-1 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />}
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-4 text-center text-xs text-muted-foreground">
                    Highlighted days have open appointment times.
                  </p>
                </>
              )}
            </>
          )}

          {step === 'time' && (
            <>
              <button onClick={() => setStep('calendar')} className="btn-ghost -ml-2 mb-3 text-sm">
                <ArrowLeft className="h-4 w-4" />
                Back to calendar
              </button>
              <p className="text-sm text-muted-foreground">Available times for</p>
              <p className="mb-4 font-semibold text-foreground">{selectedDateLabel}</p>
              {availableSlotsForSelectedDay.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No times left for this day.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {availableSlotsForSelectedDay.map((time) => (
                    <button
                      key={time}
                      onClick={() => {
                        setSelectedTime(time)
                        setStep('form')
                      }}
                      className="flex items-center justify-center gap-1.5 rounded-md border border-border py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary"
                    >
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {time}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 'form' && (
            <>
              <button onClick={() => setStep('time')} className="btn-ghost -ml-2 mb-3 text-sm">
                <ArrowLeft className="h-4 w-4" />
                Back to times
              </button>
              <p className="text-sm text-muted-foreground">Confirming appointment for</p>
              <p className="mb-4 font-semibold text-foreground">
                {selectedDateLabel} at {selectedTime}
              </p>
              <form className="space-y-3" onSubmit={handleConfirm}>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Full name</label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Doe"
                      className="field-input pl-9"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Phone number</label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      required
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                      className="field-input pl-9"
                    />
                  </div>
                </div>
                <button type="submit" disabled={submitting} className="btn-primary mt-2 w-full">
                  {submitting ? 'Booking…' : 'Confirm Booking'}
                </button>
              </form>
            </>
          )}

          {step === 'confirmed' && (
            <div className="flex flex-col items-center py-4 text-center">
              <CheckCircle2 className="h-14 w-14 text-primary" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">Booking Confirmed!</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                We'll see {name || 'you'} on {selectedDateLabel} at {selectedTime}.
              </p>
              <div className="mt-4 w-full rounded-lg border border-border bg-background/50 p-4 text-left text-sm">
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium text-foreground">{name || '—'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Phone</span>
                  <span className="font-medium text-foreground">{phone || '—'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium text-foreground">{selectedDateLabel}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Time</span>
                  <span className="font-medium text-foreground">{selectedTime}</span>
                </div>
              </div>
              <button onClick={handleClose} className="btn-primary mt-5 w-full">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
