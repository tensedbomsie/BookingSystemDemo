import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck, Clock, Settings as SettingsIcon, LogOut, Trash2, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DAY_LABELS, labelMinutes } from '../lib/time'

type Tab = 'bookings' | 'availability' | 'settings'

type Booking = {
  id: string
  customer_name: string
  customer_phone: string
  booking_date: string
  booking_time: string
  status: string
}

type BusinessHour = { day_of_week: number; is_open: boolean; start_time: string; end_time: string }
type BlockedDate = { id: string; date: string }

function formatDateLabel(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function statusStyle(status: string) {
  if (status === 'confirmed') return { backgroundColor: 'var(--color-secondary)', color: 'var(--color-primary)' }
  if (status === 'completed') return { backgroundColor: 'var(--color-muted)', color: 'var(--color-muted-foreground)' }
  return { backgroundColor: 'rgb(239 68 68 / 0.12)', color: 'rgb(248 113 113)' }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [tab, setTab] = useState<Tab>('bookings')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate('/login')
      else setCheckingAuth(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate('/login')
    })
    return () => sub.subscription.unsubscribe()
  }, [navigate])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (checkingAuth) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">Loading…</div>
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container-tight flex items-center justify-between py-4">
          <h1 className="text-lg font-semibold text-foreground">Booking Dashboard</h1>
          <button onClick={handleLogout} className="btn-ghost text-sm">
            <LogOut className="h-4 w-4" />
            Log Out
          </button>
        </div>
      </header>

      <div className="container-tight py-6">
        <div className="mb-6 flex gap-2 border-b border-border pb-2">
          <button data-active={tab === 'bookings'} onClick={() => setTab('bookings')} className="tab-button">
            <CalendarCheck className="h-4 w-4" />
            Bookings
          </button>
          <button data-active={tab === 'availability'} onClick={() => setTab('availability')} className="tab-button">
            <Clock className="h-4 w-4" />
            Availability
          </button>
          <button data-active={tab === 'settings'} onClick={() => setTab('settings')} className="tab-button">
            <SettingsIcon className="h-4 w-4" />
            Settings
          </button>
        </div>

        {tab === 'bookings' && <BookingsTab />}
        {tab === 'availability' && <AvailabilityTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  )
}

function BookingsTab() {
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data, error } = await supabase.from('bookings').select('*')
    if (error) {
      setError(error.message)
      return
    }
    const sorted = [...(data ?? [])].sort((a, b) => {
      if (a.booking_date !== b.booking_date) return a.booking_date < b.booking_date ? -1 : 1
      return labelMinutes(a.booking_time) - labelMinutes(b.booking_time)
    })
    setBookings(sorted)
  }

  useEffect(() => {
    load()
  }, [])

  async function updateStatus(id: string, status: string) {
    await supabase.from('bookings').update({ status }).eq('id', id)
    load()
  }

  if (error) return <p className="text-sm text-red-400">{error}</p>
  if (!bookings) return <p className="text-sm text-muted-foreground">Loading bookings…</p>
  if (bookings.length === 0) return <p className="text-sm text-muted-foreground">No bookings yet.</p>

  return (
    <div className="space-y-2">
      {bookings.map((b) => (
        <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
          <div>
            <p className="font-semibold text-foreground">
              {formatDateLabel(b.booking_date)} · {b.booking_time}
            </p>
            <p className="text-sm text-muted-foreground">
              {b.customer_name} · {b.customer_phone}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="status-pill" style={statusStyle(b.status)}>
              {b.status}
            </span>
            {b.status === 'confirmed' && (
              <>
                <button onClick={() => updateStatus(b.id, 'completed')} className="btn-ghost text-xs">
                  Mark Completed
                </button>
                <button onClick={() => updateStatus(b.id, 'cancelled')} className="btn-ghost text-xs">
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function AvailabilityTab() {
  const [hours, setHours] = useState<BusinessHour[] | null>(null)
  const [blocked, setBlocked] = useState<BlockedDate[] | null>(null)
  const [newBlockedDate, setNewBlockedDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function load() {
    const [{ data: h }, { data: b }] = await Promise.all([
      supabase.from('business_hours').select('*').order('day_of_week'),
      supabase.from('blocked_dates').select('*').order('date'),
    ])
    setHours(h ?? [])
    setBlocked(b ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  function updateDay(day: number, patch: Partial<BusinessHour>) {
    setHours((prev) => prev!.map((h) => (h.day_of_week === day ? { ...h, ...patch } : h)))
  }

  async function saveHours() {
    if (!hours) return
    setSaving(true)
    setMessage(null)
    const { error } = await supabase.from('business_hours').upsert(hours, { onConflict: 'day_of_week' })
    setSaving(false)
    setMessage(error ? error.message : 'Hours saved.')
  }

  async function addBlockedDate() {
    if (!newBlockedDate) return
    await supabase.from('blocked_dates').insert({ date: newBlockedDate })
    setNewBlockedDate('')
    load()
  }

  async function removeBlockedDate(id: string) {
    await supabase.from('blocked_dates').delete().eq('id', id)
    load()
  }

  if (!hours || !blocked) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-3 font-semibold text-foreground">Weekly Hours</h2>
        <div className="space-y-2">
          {hours.map((h) => (
            <div key={h.day_of_week} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
              <label className="flex w-24 items-center gap-2 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={h.is_open}
                  onChange={(e) => updateDay(h.day_of_week, { is_open: e.target.checked })}
                />
                {DAY_LABELS[h.day_of_week]}
              </label>
              <input
                type="time"
                disabled={!h.is_open}
                value={h.start_time.slice(0, 5)}
                onChange={(e) => updateDay(h.day_of_week, { start_time: e.target.value })}
                className="field-input w-32"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <input
                type="time"
                disabled={!h.is_open}
                value={h.end_time.slice(0, 5)}
                onChange={(e) => updateDay(h.day_of_week, { end_time: e.target.value })}
                className="field-input w-32"
              />
            </div>
          ))}
        </div>
        <button onClick={saveHours} disabled={saving} className="btn-primary mt-4">
          {saving ? 'Saving…' : 'Save Hours'}
        </button>
        {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}
      </div>

      <div>
        <h2 className="mb-3 font-semibold text-foreground">Blocked Dates</h2>
        <div className="flex flex-wrap gap-2">
          {blocked.length === 0 && <p className="text-sm text-muted-foreground">No blocked dates.</p>}
          {blocked.map((b) => (
            <span key={b.id} className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground">
              {b.date}
              <button onClick={() => removeBlockedDate(b.id)} aria-label="Remove blocked date">
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground transition-colors hover:text-red-400" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="date"
            value={newBlockedDate}
            onChange={(e) => setNewBlockedDate(e.target.value)}
            className="field-input w-48"
          />
          <button onClick={addBlockedDate} className="btn-secondary">
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

function SettingsTab() {
  const [id, setId] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('business_settings')
      .select('*')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setId(data.id)
          setBusinessName(data.business_name)
          setPhone(data.phone ?? '')
        }
        setLoading(false)
      })
  }, [])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!id) return
    setSaving(true)
    setMessage(null)
    const { error } = await supabase
      .from('business_settings')
      .update({ business_name: businessName, phone })
      .eq('id', id)
    setSaving(false)
    setMessage(error ? error.message : 'Saved.')
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <form onSubmit={save} className="max-w-sm space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Business Name</label>
        <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="field-input" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Phone</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className="field-input" />
      </div>
      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </form>
  )
}
