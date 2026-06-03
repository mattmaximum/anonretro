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
          <p className="text-text-3 text-sm mt-1">Last updated: June 2026</p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">Overview</h2>
          <p className="text-text-2 text-sm leading-relaxed">
            AnonRetro has two types of users with different privacy profiles: <span className="text-text-1 font-medium">participants</span> (anyone who joins a board via a shared link) and <span className="text-text-1 font-medium">facilitators</span> (the person who creates and runs the board). Participants require no account and we collect no personal information about them. Facilitators create an account and we store a minimal profile to manage their boards.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">Participants</h2>
          <div className="flex flex-col gap-2 text-sm text-text-2 leading-relaxed">
            <p><span className="text-text-1 font-medium">No account required.</span> Participants join via a shared link. No name, email, or any identifying information is collected.</p>
            <p><span className="text-text-1 font-medium">Participant tokens.</span> A random hex token is generated in your browser and stored in localStorage. This token identifies you within a board session only — it is not linked to any personal information and is never shared with other participants.</p>
            <p><span className="text-text-1 font-medium">Anonymous identity.</span> A random color + animal combination (e.g. "Blue Otter") is assigned per board. This is not linked to your real identity.</p>
            <p><span className="text-text-1 font-medium">Board content.</span> Card text and votes you submit are stored on the server for the duration of the board's retention period. This content is submitted voluntarily.</p>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">Facilitators</h2>
          <div className="flex flex-col gap-2 text-sm text-text-2 leading-relaxed">
            <p><span className="text-text-1 font-medium">Account required.</span> Board creators sign in via <a href="https://clerk.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Clerk</a>, a third-party authentication provider. Clerk collects and stores your email address and manages your credentials. See <a href="https://clerk.com/privacy" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Clerk's privacy policy</a> for details on how they handle your data.</p>
            <p><span className="text-text-1 font-medium">What we store.</span> We store your Clerk user ID and email address in our database, linked to the boards you create. This is used to enforce board ownership, apply the free-tier board limit, and allow you to manage your boards from the dashboard.</p>
            <p><span className="text-text-1 font-medium">Paid accounts.</span> Payments are processed by <a href="https://www.lemonsqueezy.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Lemon Squeezy</a>, who acts as the Merchant of Record. We do not see or store your payment card details. We store only your Lemon Squeezy order ID and a flag indicating your account is paid. See <a href="https://www.lemonsqueezy.com/privacy" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Lemon Squeezy's privacy policy</a> for details.</p>
            <p><span className="text-text-1 font-medium">Account deletion.</span> To delete your account and all associated boards, email <a href="mailto:mattmcx@gmail.com" className="text-accent hover:underline">mattmcx@gmail.com</a>. All boards and card content owned by your account will be permanently deleted.</p>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">Data we collect for all users</h2>
          <div className="flex flex-col gap-2 text-sm text-text-2 leading-relaxed">
            <p><span className="text-text-1 font-medium">Aggregate usage metrics.</span> We count daily boards created, participants joined, cards added, and timers started. These counts contain no personal information.</p>
            <p><span className="text-text-1 font-medium">Page view analytics.</span> We use <a href="https://www.cloudflare.com/web-analytics/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Cloudflare Web Analytics</a> to measure traffic volume and referral sources. It does not use cookies, does not store IP addresses, and does not track individuals across sessions. Only aggregated, anonymous data is collected.</p>
            <p><span className="text-text-1 font-medium">Server access logs.</span> Standard nginx access logs record IP addresses, timestamps, and request paths. Logs are rotated after 14 days.</p>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">Data retention</h2>
          <div className="flex flex-col gap-2 text-sm text-text-2 leading-relaxed">
            <p><span className="text-text-1 font-medium">Boards.</span> Boards and all associated data (cards, votes, participants) are automatically hard-deleted 30 days after the last activity on the board. Activity includes any card write, vote, timer action, or facilitator control. The expiry clock resets on each action — actively-used boards persist longer. The expiration countdown is shown in the board header.</p>
            <p><span className="text-text-1 font-medium">Facilitator accounts.</span> Account data (email, Clerk user ID) is retained while the account is active. Boards deleted by the facilitator are removed immediately and permanently.</p>
            <p><span className="text-text-1 font-medium">Server logs.</span> Nginx access logs are rotated and deleted after 14 days.</p>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">Card content</h2>
          <p className="text-text-2 text-sm leading-relaxed">
            Cards are submitted anonymously by participants and stored in plaintext on the server. The server operator has access to the database and could in principle read card content. Do not submit sensitive personal, medical, legal, or financial information in cards. AnonRetro is intended for professional team retrospectives.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">Third-party services</h2>
          <div className="flex flex-col gap-2 text-sm text-text-2 leading-relaxed">
            <p><span className="text-text-1 font-medium">Clerk</span> — authentication provider for facilitator accounts. Handles email/password credentials. <a href="https://clerk.com/privacy" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Privacy policy</a></p>
            <p><span className="text-text-1 font-medium">Lemon Squeezy</span> — payment processor and Merchant of Record for paid accounts. Handles all payment card data. <a href="https://www.lemonsqueezy.com/privacy" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Privacy policy</a></p>
            <p><span className="text-text-1 font-medium">Cloudflare</span> — DNS, DDoS protection, and anonymous web analytics. No cookies, no cross-session tracking. <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Privacy policy</a></p>
            <p>Fonts are self-hosted. No requests are made to Google Fonts or any other external CDN.</p>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-1">Your rights</h2>
          <div className="flex flex-col gap-2 text-sm text-text-2 leading-relaxed">
            <p><span className="text-text-1 font-medium">Participants.</span> We collect no personal information about participants and cannot identify you. There is no personal data to access, correct, or delete on your behalf. Board content is automatically deleted after 30 days of inactivity.</p>
            <p><span className="text-text-1 font-medium">Facilitators.</span> You can delete individual boards at any time from the dashboard — deletion is immediate and permanent. To request deletion of your account and all associated data, email <a href="mailto:mattmcx@gmail.com" className="text-accent hover:underline">mattmcx@gmail.com</a>.</p>
          </div>
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
