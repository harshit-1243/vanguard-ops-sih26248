import { Link } from 'react-router-dom';
import { ArrowRight, Radar, Shield, Users } from 'lucide-react';
import { PageShell } from '@/components/shell';

function Choice({ to, title, kicker, text, Icon, primary }: { to: string; title: string; kicker: string; text: string; Icon: typeof Shield; primary?: boolean }) {
  return (
    <Link
      to={to}
      className={
        'group flex flex-col justify-between rounded-lg border p-6 transition-colors ' +
        (primary ? 'border-accent/50 bg-accent/[0.06] hover:border-accent' : 'border-line bg-panel hover:border-muted')
      }
    >
      <div>
        <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          <Icon size={14} className={primary ? 'text-accent' : 'text-blue'} aria-hidden /> {kicker}
        </div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
      </div>
      <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-ink group-hover:gap-2">
        Continue <ArrowRight size={14} aria-hidden />
      </span>
    </Link>
  );
}

export default function Landing() {
  return (
    <PageShell wide>
      <section className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">SIH 2026 · PS 26248 · Closed wargame</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight md:text-4xl">
            Decide under fog. <span className="text-muted">Every commander sees a different, deliberately degraded picture.</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
            The Directing Staff control jamming, cyber effects and contradictory reports live. Every decision is frozen with
            what was knowable at that moment, so the after-action review judges judgement — not hindsight.
          </p>
          <dl className="mt-6 grid max-w-xl grid-cols-3 gap-3 text-xs">
            {[
              ['Land · Air · Sea', 'Joint roles incl. ALO & NLO'],
              ['EW · Cyber', 'Degradation computed from geometry'],
              ['SAGAT · AAR', 'SA probes, calibration, PDF'],
            ].map(([a, b]) => (
              <div key={a} className="rounded-md border border-line bg-panel p-3">
                <dt className="font-mono text-[11px] text-ink">{a}</dt>
                <dd className="mt-1 text-muted">{b}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="grid gap-4">
          <Choice to="/create" kicker="Directing Staff" title="Create exercise" Icon={Shield} primary text="Pick a scenario, get a session code and instructor PIN, then run the fog from the DS console." />
          <Choice to="/join" kicker="Trainee" title="Join exercise" Icon={Users} text="Enter the session code from your DS, choose your callsign and a free role." />
          <Link to="/ds-login" className="inline-flex items-center gap-2 text-xs text-muted hover:text-ink">
            <Radar size={13} aria-hidden /> DS on another machine? Log in with code + PIN
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
