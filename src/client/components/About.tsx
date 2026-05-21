import { useNavigate } from 'react-router-dom'

export default function About() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex flex-col items-center p-6 py-12">
      <div className="w-full max-w-2xl flex flex-col gap-8">
        <div>
          <button
            onClick={() => navigate('/')}
            className="text-text-3 text-sm hover:text-text-2 transition-colors mb-6 flex items-center gap-1"
          >
            ← Back to home
          </button>
          <h1 className="text-2xl font-semibold text-text-1">About AnonRetro</h1>
        </div>

        <section className="flex flex-col gap-3">
          <p className="text-text-2 text-sm leading-relaxed">
            AnonRetro was built to solve a frustration of mine. Most retrospective tools are
            complicated, cost money, require accounts, and come loaded with friction. Nothing wrong
            with that — but sometimes you just want something easy and free, without writing a
            business case or waiting for corporate approvals. You have things to do and projects
            to ship.
          </p>
          <p className="text-text-2 text-sm leading-relaxed">
            That's why I built AnonRetro. No accounts. No paywalls. Get your team into a room —
            virtual or otherwise — and run a retro.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">Keep it running</h2>
          <p className="text-text-2 text-sm leading-relaxed">
            AnonRetro is free to use, but it does cost money to host. If it helped you out in a
            pinch, consider contributing — a cup of coffee keeps the lights on for a month.
          </p>
          <p className="text-text-3 text-sm italic">Donation link coming soon.</p>
        </section>

        <p className="text-text-3 text-sm">Made with ♥ — Matt</p>
      </div>
    </div>
  )
}
