import { useState } from 'react'
import { CalendarDays, Sparkles } from 'lucide-react'
import BookingModal from './BookingModal'

export default function App() {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-16 text-center">
      <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        UX Demo — No Data Is Stored
      </span>
      <h1 className="max-w-xl text-3xl font-bold text-foreground sm:text-4xl">
        Booking System Demo
      </h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        A mock of what customers see when they book an appointment: pick a date, pick a time,
        enter contact info, and confirm. This component is designed to drop into any client site
        and inherit that site's own colors automatically.
      </p>

      <button onClick={() => setOpen(true)} className="btn-primary mt-8 text-base">
        <CalendarDays className="h-5 w-5" />
        Book an Appointment
      </button>

      <BookingModal open={open} onClose={() => setOpen(false)} businessName="Sample Business" />
    </div>
  )
}
