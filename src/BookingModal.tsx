import { useMemo, useState } from 'react'
import { X, ChevronLeft, ChevronRight, ArrowLeft, Clock, CheckCircle2, User, Phone } from 'lucide-react'

/*
 * BookingModal — mock appointment booking flow.
 *
 * UI-only: no backend, no persistence. Drop this file (plus the .cal-cell /
 * .modal-overlay / .modal-panel / .field-input / .btn-primary / .btn-ghost
 * utilities from styles.css) into any client site and it inherits that
 * site's --color-* variables automatically.
 *
 * Usage:
 *   const [open, setOpen] = useState(false)
 *   <button onClick={() => setOpen(true)}>Book Now</button>
 *   <BookingModal open={open} onClose={() => setOpen(false)} businessName="Miss. D's Pet Grooming" />
 */

type Step = 'calendar' | 'time' | 'form' | 'confirmed'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const TIME_SLOTS = ['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:30 PM']

function isMockAvailable(day: number, monthIndex: number, weekday: number) {
  if (weekday === 0) return false
  return (day + monthIndex) % 3 !== 0
}

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

  if (!open) return null

  const cells = buildMonthGrid(viewYear, viewMonth)
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth()

  function reset() {
    setStep('calendar')
    setSelectedDay(null)
    setSelectedTime(null)
    setName('')
    setPhone('')
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

  const selectedDateLabel =
    selectedDay != null ? `${MONTH_LABELS[viewMonth]} ${selectedDay}, ${viewYear}` : ''

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

              <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-muted-foreground">
                {DAY_LABELS.map((d) => (
                  <div key={d} className="py-1">{d}</div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1.5">
                {cells.map((cell, i) => {
                  if (!cell) return <div key={`blank-${i}`} />
                  const { day, weekday } = cell
                  const isPast = isCurrentMonth && day < today.getDate()
                  const available = !isPast && isMockAvailable(day, viewMonth, weekday)
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
                        backgroundColor: isSelected
                          ? 'transparent'
                          : available
                            ? 'var(--color-secondary)'
                            : 'transparent',
                        borderColor: isSelected ? 'var(--color-primary)' : 'transparent',
                        color: available ? 'var(--color-foreground)' : 'var(--color-muted-foreground)',
                        opacity: available ? 1 : 0.4,
                        cursor: available ? 'pointer' : 'not-allowed',
                      }}
                    >
                      <span>{day}</span>
                      {available && (
                        <span
                          className="h-1 w-1 rounded-full"
                          style={{ backgroundColor: 'var(--color-primary)' }}
                        />
                      )}
                    </button>
                  )
                })}
              </div>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Highlighted days have open appointment times.
              </p>
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
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {TIME_SLOTS.map((time) => (
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
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  setStep('confirmed')
                }}
              >
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
                <button type="submit" className="btn-primary mt-2 w-full">
                  Confirm Booking
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
