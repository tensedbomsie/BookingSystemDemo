import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Phone, Sparkles } from 'lucide-react'
import BookingModal from '../BookingModal'
import { supabase } from '../lib/supabase'

export default function PublicBooking() {
  const [open, setOpen] = useState(false)
  const [businessName, setBusinessName] = useState('Sample Business')
  const [phone, setPhone] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('booking_settings')
      .select('business_name, phone')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setBusinessName(data.business_name)
          setPhone(data.phone)
        }
      })
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-16 text-center">
      <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Self-Service Booking
      </span>
      <h1 className="max-w-xl text-3xl font-bold text-foreground sm:text-4xl">{businessName}</h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        Pick a date and time that works for you — no calls, no waiting on a reply.
      </p>
      {phone && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Phone className="h-3.5 w-3.5" />
          {phone}
        </p>
      )}

      <button onClick={() => setOpen(true)} className="btn-primary mt-8 text-base">
        <CalendarDays className="h-5 w-5" />
        Book an Appointment
      </button>

      <BookingModal open={open} onClose={() => setOpen(false)} businessName={businessName} />

      <Link to="/login" className="btn-ghost mt-14 text-xs">
        Business owner? Log in
      </Link>
    </div>
  )
}
