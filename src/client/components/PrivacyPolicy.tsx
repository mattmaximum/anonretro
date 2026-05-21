import { useNavigate } from 'react-router-dom'

export default function PrivacyPolicy() {
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
          <h1 className="text-2xl font-semibold text-text-1">Privacy Policy</h1>
          <p className="text-text-3 text-sm mt-1">Last updated: May 2025</p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">Overview</h2>
          <p className="text-text-2 text-sm leading-relaxed">
            AnonRetro is designed to collect as little data as possible. There are no accounts, no
            tracking pixels, and no third-party analytics. This policy explains exactly what data
            passes through the server and how long it is retained.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">What we collect</h2>
          <div className="flex flex-col gap-2 text-sm text-text-2 leading-relaxed">
            <p><span className="text-text-1 font-medium">Board content.</span> Card text, votes, and board titles are stored in a SQLite database on the server. This content is submitted voluntarily by participants.</p>
            <p><span className="text-text-1 font-medium">Participant tokens.</span> When you join a board, a random hex token is generated and stored in your browser's localStorage. This token identifies you within a board session only — it is not linked to any personal information.</p>
            <p><span className="text-text-1 font-medium">Anonymous identities.</span> A random color + animal combination (e.g. "Blue Otter") is assigned to each participant per board. This is not linked to your identity.</p>
            <p><span className="text-text-1 font-medium">Aggregate usage metrics.</span> We count daily boards created, participants joined, cards added, and timers started. These counts contain no personal information and are used only to understand usage trends.</p>
            <p><span className="text-text-1 font-medium">Server access logs.</span> Standard nginx access logs record IP addresses, timestamps, and request paths. Logs are rotated after 14 days and then deleted.</p>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">What we do not collect</h2>
          <ul className="text-sm text-text-2 leading-relaxed list-disc list-inside flex flex-col gap-1">
            <li>Names, email addresses, or any account information</li>
            <li>Device fingerprints or browser identifiers</li>
            <li>Third-party analytics or advertising tracking</li>
            <li>Cookies (localStorage tokens are stored client-side only)</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">Data retention</h2>
          <p className="text-text-2 text-sm leading-relaxed">
            Boards and all associated data (cards, votes, participants) are automatically deleted 7 days
            after the last facilitator action on the board. The expiry clock resets on each facilitator
            action — locking, revealing, starting a timer — so actively-used boards persist longer.
            Server access logs are rotated and deleted after 14 days.
          </p>
          <p className="text-text-2 text-sm leading-relaxed">
            Facilitators can permanently delete a board at any time using the Delete Board button in
            Facilitator Controls. Deletion is immediate and irreversible.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">Shared and public computers</h2>
          <p className="text-text-2 text-sm leading-relaxed">
            Participant tokens are stored in localStorage in your browser. If you use a shared or
            public computer, clearing your browser's localStorage will remove your tokens. Because boards
            expire 7 days after last facilitator activity (not from when you joined), old board data will
            be removed from the server within that window regardless.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">Third-party services</h2>
          <p className="text-text-2 text-sm leading-relaxed">
            AnonRetro does not use any third-party services that receive participant data. Fonts are
            self-hosted — no requests are made to Google Fonts or any other external CDN.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">Card content</h2>
          <p className="text-text-2 text-sm leading-relaxed">
            Cards are submitted anonymously. However, the server operator has access to the database
            and could in principle read card content. Do not submit sensitive personal, medical, legal,
            or financial information in cards. AnonRetro is intended for professional team retrospectives.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">Your rights</h2>
          <p className="text-text-2 text-sm leading-relaxed">
            Because we collect no personal information and cannot link tokens to individuals, there is
            no personal data to access, correct, or export on your behalf. If you are a facilitator
            and wish to delete a board and all its data, use the Delete Board button. All data for
            that board is removed immediately.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">Contact</h2>
          <p className="text-text-2 text-sm leading-relaxed">
            Questions about this policy can be sent to{' '}
            <a href="mailto:mattmcx@gmail.com" className="text-accent hover:underline">mattmcx@gmail.com</a>.
          </p>
        </section>
      </div>
    </div>
  )
}
