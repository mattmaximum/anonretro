import { useEffect } from 'react'
import { Link } from 'react-router-dom'

const FORMATS_GUIDE = [
  {
    name: 'Well / Unwell / Suggestions',
    focus: 'Objective evaluation. Surfaces what worked, what didn\'t, and collects concrete suggestions for the next cycle.',
    bestFor: 'Standard sprints focused heavily on process mechanics and delivery metrics.',
  },
  {
    name: 'Mad / Sad / Glad',
    focus: 'Emotional health. Surfaces unspoken friction, frustrations, energy drains, and team victories.',
    bestFor: 'Post-incident reviews or after high-stress, crunch-heavy sprints.',
  },
  {
    name: '4Ls (Liked, Learned, Lacked, Longed For)',
    focus: 'Continuous learning. Balances appreciation with identifying systemic gaps and future wishlists.',
    bestFor: 'End of a larger project or quarterly reviews looking at systemic improvements.',
  },
  {
    name: 'Start / Stop / Continue',
    focus: 'Behavioral adjustments. Directs the team to suggest new habits, end ineffective ones, and maintain good ones.',
    bestFor: 'Forming new working agreements or when the team feels stuck in a process rut.',
  },
  {
    name: 'Sailboat',
    focus: 'Strategic alignment. Visually maps momentum (Sails), drag (Anchors), upcoming risks (Rocks), and goals (Island).',
    bestFor: 'Kickoffs, mid-quarter check-ins, or aligning on upcoming hazards.',
  },
  {
    name: 'Rose, Bud, Thorn',
    focus: 'Potential and innovation. Highlights successes (Rose), untested ideas to nurture (Bud), and pain points (Thorn).',
    bestFor: 'Design phases, innovation-heavy sprints, or encouraging new ideas over past execution.',
  },
]

export default function Formats() {
  useEffect(() => {
    document.title = 'Which format should I use? — AnonRetro'
    return () => { document.title = 'AnonRetro — Retrospectives without anchoring bias' }
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center p-6 pt-12 pb-16 gap-8">
      <div className="w-full max-w-4xl">
        <Link to="/" className="text-text-3 hover:text-text-2 text-sm transition-colors">← Back</Link>
      </div>

      <div className="w-full max-w-4xl">
        <h1 className="text-2xl font-semibold text-text-1 tracking-tight">Which format should I use?</h1>
        <p className="text-text-3 text-sm mt-1.5">Each format surfaces a different kind of feedback. Pick the one that matches what your team needs right now.</p>
      </div>

      <div className="w-full max-w-4xl bg-surface border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-raised">
              <th className="text-left px-5 py-3 text-text-3 font-medium text-xs uppercase tracking-wider w-[26%]">Board Format</th>
              <th className="text-left px-5 py-3 text-text-3 font-medium text-xs uppercase tracking-wider w-[37%]">The Focus</th>
              <th className="text-left px-5 py-3 text-text-3 font-medium text-xs uppercase tracking-wider w-[37%]">Best Used For</th>
            </tr>
          </thead>
          <tbody>
            {FORMATS_GUIDE.map((f, i) => (
              <tr
                key={f.name}
                className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-raised/40' : ''}`}
              >
                <td className="px-5 py-4 text-text-1 font-medium align-top">{f.name}</td>
                <td className="px-5 py-4 text-text-2 align-top">{f.focus}</td>
                <td className="px-5 py-4 text-text-2 align-top">{f.bestFor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
