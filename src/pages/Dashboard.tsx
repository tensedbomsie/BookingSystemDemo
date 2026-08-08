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
  price: number | null
  invoice_sent_at: string | null
  created_at: string
}

function buildVisitCounts(bookings: Booking[]): Map<string, { visitNumber: number; totalVisits: number }> {
  const byPhone = new Map<string, Booking[]>()
  for (const b of bookings) {
    const list = byPhone.get(b.customer_phone) ?? []
    list.push(b)
    byPhone.set(b.customer_phone, list)
  }
  const result = new Map<string, { visitNumber: number; totalVisits: number }>()
  for (const list of byPhone.values()) {
    const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at))
    sorted.forEach((b, i) => result.set(b.id, { visitNumber: i + 1, totalVisits: sorted.length }))
  }
  return result
}

type BookingSettings = {
  business_name: string
  venmo_handle: string | null
  zelle_handle: string | null
  cashapp_handle: string | null
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
  const [settings, setSettings] = useState<BookingSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [invoiceTarget, setInvoiceTarget] = useState<Booking | null>(null)

  async function load() {
    const [{ data, error }, { data: settingsData }] = await Promise.all([
      supabase.from('bookings').select('*'),
      supabase
        .from('booking_settings')
        .select('business_name, venmo_handle, zelle_handle, cashapp_handle')
        .limit(1)
        .maybeSingle(),
    ])
    if (error) {
      setError(error.message)
      return
    }
    const sorted = [...(data ?? [])].sort((a, b) => {
      if (a.booking_date !== b.booking_date) return a.booking_date < b.booking_date ? -1 : 1
      return labelMinutes(a.booking_time) - labelMinutes(b.booking_time)
    })
    setBookings(sorted)
    setSettings(settingsData ?? null)
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

  const now = new Date()
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthRevenue = bookings
    .filter((b) => b.status === 'completed' && b.booking_date.startsWith(monthPrefix) && b.price != null)
    .reduce((sum, b) => sum + (b.price ?? 0), 0)
  const upcomingCount = bookings.filter((b) => b.status === 'confirmed').length
  const completedCount = bookings.filter((b) => b.status === 'completed').length
  const unpaidCount = bookings.filter((b) => b.status === 'completed' && !b.invoice_sent_at).length
  const collectedTotal = bookings
    .filter((b) => b.invoice_sent_at != null && b.price != null)
    .reduce((sum, b) => sum + (b.price ?? 0), 0)
  const outstandingBookings = bookings.filter((b) => b.status === 'completed' && b.price != null && !b.invoice_sent_at)
  const outstandingTotal = outstandingBookings.reduce((sum, b) => sum + (b.price ?? 0), 0)
  const visitCounts = buildVisitCounts(bookings)

  if (bookings.length === 0) return <p className="text-sm text-muted-foreground">No bookings yet.</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Revenue This Month</p>
          <p className="mt-1 text-xl font-semibold text-foreground">${monthRevenue.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Upcoming Bookings</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{upcomingCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Completed</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{completedCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Unpaid Invoices</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{unpaidCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Collected</p>
          <p className="mt-1 text-xl font-semibold text-emerald-400">${collectedTotal.toFixed(2)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">All-time, across invoices</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Outstanding</p>
          <p className="mt-1 text-xl font-semibold text-red-400">${outstandingTotal.toFixed(2)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Still owed to you</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Needs Attention</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{outstandingBookings.length}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Completed jobs, no invoice sent yet</p>
        </div>
      </div>

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
            {(visitCounts.get(b.id)?.totalVisits ?? 1) > 1 && (
              <p className="mt-1 text-xs text-emerald-400">
                🔁 ลูกค้าประจำ (ครั้งที่ {visitCounts.get(b.id)?.visitNumber})
              </p>
            )}
            {b.status === 'completed' && b.price != null && (
              <p className="mt-1 text-xs text-muted-foreground">
                ${b.price.toFixed(2)} · {b.invoice_sent_at ? 'invoice sent' : 'invoice not sent yet'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="status-pill" style={statusStyle(b.status)}>
              {b.status}
            </span>
            {b.status === 'confirmed' && (
              <>
                <button onClick={() => setInvoiceTarget(b)} className="btn-ghost text-xs">
                  Mark Completed
                </button>
                <button onClick={() => updateStatus(b.id, 'cancelled')} className="btn-ghost text-xs">
                  Cancel
                </button>
              </>
            )}
            {b.status === 'completed' && !b.invoice_sent_at && (
              <button onClick={() => setInvoiceTarget(b)} className="btn-ghost text-xs">
                Send Invoice
              </button>
            )}
          </div>
        </div>
      ))}
      </div>

      {invoiceTarget && (
        <InvoiceModal
          booking={invoiceTarget}
          settings={settings}
          onClose={() => setInvoiceTarget(null)}
          onDone={() => {
            setInvoiceTarget(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function InvoiceModal({
  booking,
  settings,
  onClose,
  onDone,
}: {
  booking: Booking
  settings: BookingSettings | null
  onClose: () => void
  onDone: () => void
}) {
  const [price, setPrice] = useState(booking.price != null ? String(booking.price) : '')
  const [saving, setSaving] = useState(false)

  const amount = Number(price)
  const venmoLink =
    settings?.venmo_handle && amount > 0
      ? `https://venmo.com/${settings.venmo_handle.replace(/^@/, '')}?txn=charge&amount=${amount.toFixed(2)}&note=${encodeURIComponent(
          `${settings.business_name} — thanks for booking!`,
        )}`
      : null
  const cashAppLink =
    settings?.cashapp_handle && amount > 0
      ? `https://cash.app/${settings.cashapp_handle.replace(/^\$/, '$')}/${amount.toFixed(2)}`
      : null

  const paymentLines: string[] = []
  if (venmoLink) paymentLines.push(`Venmo: ${venmoLink}`)
  if (cashAppLink) paymentLines.push(`Cash App: ${cashAppLink}`)
  if (settings?.zelle_handle) paymentLines.push(`Zelle: ${settings.zelle_handle}`)
  const hasAnyPaymentMethod = paymentLines.length > 0

  const message = `Hi ${booking.customer_name}! Thanks for booking with ${settings?.business_name ?? 'us'} 🐾 Your total today is $${
    amount > 0 ? amount.toFixed(2) : '__'
  }.${hasAnyPaymentMethod ? ` You can pay via ${paymentLines.join(' or ')}` : ''}`

  async function sendInvoice() {
    if (!amount || amount <= 0) return
    setSaving(true)
    await supabase
      .from('bookings')
      .update({ status: 'completed', price: amount, invoice_sent_at: new Date().toISOString() })
      .eq('id', booking.id)
    setSaving(false)
    window.location.href = `sms:${booking.customer_phone}?body=${encodeURIComponent(message)}`
    onDone()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 font-semibold text-foreground">Send Invoice — {booking.customer_name}</h2>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Amount ($)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="field-input mb-3"
          placeholder="65.00"
          autoFocus
        />
        <p className="mb-4 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">{message}</p>
        {!hasAnyPaymentMethod && (
          <p className="mb-3 text-xs text-amber-400">
            No payment method set — add Venmo, Cash App, or Zelle in Settings to include a payment link automatically.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-xs" disabled={saving}>
            Cancel
          </button>
          <button onClick={sendInvoice} className="btn-primary text-xs" disabled={saving || !amount}>
            {saving ? 'Sending…' : 'Mark Completed & Text Invoice'}
          </button>
        </div>
      </div>
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
      supabase.from('booking_hours').select('*').order('day_of_week'),
      supabase.from('booking_blocked_dates').select('*').order('date'),
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
    const { error } = await supabase.from('booking_hours').upsert(hours, { onConflict: 'day_of_week' })
    setSaving(false)
    setMessage(error ? error.message : 'Hours saved.')
  }

  async function addBlockedDate() {
    if (!newBlockedDate) return
    await supabase.from('booking_blocked_dates').insert({ date: newBlockedDate })
    setNewBlockedDate('')
    load()
  }

  async function removeBlockedDate(id: string) {
    await supabase.from('booking_blocked_dates').delete().eq('id', id)
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
  const [venmoHandle, setVenmoHandle] = useState('')
  const [zelleHandle, setZelleHandle] = useState('')
  const [cashappHandle, setCashappHandle] = useState('')
  const [defaultPrice, setDefaultPrice] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('booking_settings')
      .select('*')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setId(data.id)
          setBusinessName(data.business_name)
          setPhone(data.phone ?? '')
          setVenmoHandle(data.venmo_handle ?? '')
          setZelleHandle(data.zelle_handle ?? '')
          setCashappHandle(data.cashapp_handle ?? '')
          setDefaultPrice(data.default_price != null ? String(data.default_price) : '')
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
      .from('booking_settings')
      .update({
        business_name: businessName,
        phone,
        venmo_handle: venmoHandle || null,
        zelle_handle: zelleHandle || null,
        cashapp_handle: cashappHandle || null,
        default_price: defaultPrice ? Number(defaultPrice) : null,
      })
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
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Venmo Handle (for invoices)</label>
        <input
          value={venmoHandle}
          onChange={(e) => setVenmoHandle(e.target.value)}
          className="field-input"
          placeholder="@your-venmo-name"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Cash App $Cashtag (for invoices)</label>
        <input
          value={cashappHandle}
          onChange={(e) => setCashappHandle(e.target.value)}
          className="field-input"
          placeholder="$your-cashtag"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Zelle (email or phone, for invoices)</label>
        <input
          value={zelleHandle}
          onChange={(e) => setZelleHandle(e.target.value)}
          className="field-input"
          placeholder="you@example.com"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Add any combination — customers will see whichever payment methods you've set up when you send an invoice.
      </p>

      <div className="border-t border-border pt-3">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Charge at booking (Stripe) — service price
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={defaultPrice}
          onChange={(e) => setDefaultPrice(e.target.value)}
          className="field-input"
          placeholder="e.g. 75.00"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Set a price to require card payment at the moment of booking, before the slot is confirmed. Leave blank to
          keep booking free (invoice after, like today). Requires a Stripe account connected on the backend.
        </p>
      </div>

      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </form>
  )
}
