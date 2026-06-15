import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const CATEGORIES = ['Billing', 'Support', 'Feature Request', 'General / Other']

export default function Contact() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    document.title = 'Contact — AnonRetro'
    return () => { document.title = 'AnonRetro — Retrospectives without anchoring bias' }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, category, message }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Try again.')
      } else {
        setSuccess(true)
      }
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-6 py-12">
      <div className="w-full max-w-2xl flex flex-col gap-8">
        <div>
          <Link
            to="/"
            className="text-text-3 text-sm hover:text-text-2 transition-colors mb-6 flex items-center gap-1"
          >
            ← Back to home
          </Link>
          <h1 className="text-2xl font-semibold text-text-1">Contact</h1>
          <p className="text-text-2 text-sm mt-1">Billing questions, support, or feedback — I read everything.</p>
        </div>

        {success ? (
          <div className="bg-surface border border-border rounded-lg px-6 py-8 text-center flex flex-col gap-3">
            <p className="text-text-1 font-medium">Message sent</p>
            <p className="text-text-2 text-sm">Thanks for reaching out. I'll get back to you as soon as I can.</p>
            <Link to="/" className="text-accent hover:underline text-sm mt-2">Back to home</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-text-1 text-sm font-medium">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  maxLength={100}
                  placeholder="Your name"
                  className="bg-raised border border-border rounded px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-border-active"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-text-1 text-sm font-medium">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  maxLength={200}
                  placeholder="your@email.com"
                  className="bg-raised border border-border rounded px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-border-active"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-text-1 text-sm font-medium">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="bg-raised border border-border rounded px-3 py-2 text-sm text-text-1 outline-none focus:border-border-active"
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-text-1 text-sm font-medium">Message</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                required
                maxLength={5000}
                rows={6}
                placeholder="What's on your mind?"
                className="bg-raised border border-border rounded px-3 py-2 text-sm text-text-1 placeholder:text-text-3 outline-none focus:border-border-active resize-none"
              />
              <p className="text-text-3 text-xs text-right">{message.length}/5000</p>
            </div>

            {error && <p className="text-danger text-sm">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="bg-accent hover:bg-accent-hover text-white font-medium py-2 px-4 rounded transition-colors disabled:opacity-50 self-start"
            >
              {submitting ? 'Sending…' : 'Send message'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
