import type { Metadata } from 'next';
import Link from 'next/link';
import { Rss, BookOpen, ArrowLeft } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

export const metadata: Metadata = {
  title: 'Methodology',
  description:
    'How AI Job Clock calculates its live employment displacement figures — methodology, sources, and limitations.',
};

export default function MethodologyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="text-lg font-black tracking-tight"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            AI Job Clock
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/blog"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Daily Briefings"
            >
              <BookOpen className="h-4 w-4" />
            </Link>
            <a
              href="/api/rss"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="RSS Feed"
            >
              <Rss className="h-4 w-4" />
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Clock
        </Link>

        <article>
          <h1
            className="text-3xl md:text-4xl font-black tracking-tight mb-6"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            How AI Job Clock Works
          </h1>
          <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
            AI Job Clock is a speculative, real-time visualization of global AI-driven job
            displacement. Here&apos;s exactly how the numbers are calculated.
          </p>

          <section className="space-y-8">
            <div>
              <h2
                className="text-xl font-bold mb-3"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                1. Baseline Employment Figure
              </h2>
              <p className="text-foreground/80 leading-relaxed">
                We start from an estimated <strong>4 billion employed people worldwide</strong>,
                based on International Labour Organization (ILO) global employment statistics. This
                is the starting point from which the clock counts down.
              </p>
            </div>
            <div>
              <h2
                className="text-xl font-bold mb-3"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                2. Daily Displacement Rate
              </h2>
              <p className="text-foreground/80 leading-relaxed">
                A daily displacement rate is computed from aggregated signals: news articles about
                AI-driven layoffs, automation announcements, labor market reports, and corporate
                earnings calls mentioning workforce reduction through AI. This rate is updated
                regularly as new data comes in.
              </p>
            </div>
            <div>
              <h2
                className="text-xl font-bold mb-3"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                3. Real-Time Clock
              </h2>
              <p className="text-foreground/80 leading-relaxed">
                The headline counter ticks down every second based on the daily displacement rate
                converted to a per-second figure. The &ldquo;countdown to zero&rdquo; is a purely
                mechanical extrapolation — if the current rate were to continue indefinitely without
                any offsetting job creation.
              </p>
            </div>
            <div>
              <h2
                className="text-xl font-bold mb-3"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                4. Sector Breakdown
              </h2>
              <p className="text-foreground/80 leading-relaxed">
                Jobs at risk are broken down across nine sectors:{' '}
                <strong>
                  Technology, Finance, Healthcare, Manufacturing, Retail, Media, Legal, Education,
                  and Transportation
                </strong>
                . Sector weights are determined by article volume and known automation exposure
                indexes from research institutions like McKinsey Global Institute and the World
                Economic Forum.
              </p>
            </div>
            <div>
              <h2
                className="text-xl font-bold mb-3"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                5. News Aggregation
              </h2>
              <p className="text-foreground/80 leading-relaxed">
                Our automated scraping system collects AI-related employment news from major
                outlets, categorizes each story by sector, and extracts key signals. These feed
                into both the daily briefings available on the{' '}
                <Link href="/blog" className="underline text-foreground hover:text-primary">
                  blog
                </Link>{' '}
                and the displacement rate calculations.
              </p>
            </div>
            <div>
              <h2
                className="text-xl font-bold mb-3"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                6. Important Limitations
              </h2>
              <p className="text-foreground/80 leading-relaxed">
                This model is a <strong>thought experiment, not a prediction</strong>. It does not
                account for:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-1.5 text-foreground/80">
                <li>New jobs created by AI and related industries</li>
                <li>Government policy interventions (retraining programs, regulation)</li>
                <li>Economic cycles and market corrections</li>
                <li>Regional variations in automation adoption</li>
                <li>Workers transitioning to adjacent roles</li>
              </ul>
            </div>
          </section>

          <div className="rounded-lg bg-accent/5 border border-accent/20 p-4 mt-10">
            <p className="text-sm text-accent font-medium">
              ⚠ This is a speculative projection, not financial or employment advice. The clock is
              designed to provoke discussion about the pace of AI-driven workforce change.
            </p>
          </div>

          <div className="mt-10 flex flex-wrap gap-4 text-sm">
            <Link href="/" className="underline text-muted-foreground hover:text-foreground">
              ← Back to the Clock
            </Link>
            <Link
              href="/blog"
              className="underline text-muted-foreground hover:text-foreground"
            >
              Read Daily Briefings
            </Link>
          </div>
        </article>
      </main>

      <footer className="border-t border-border py-6 mt-12">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs text-muted-foreground/50 text-center">
            Data sourced via automated web scraping. All projections are speculative. Not financial
            or employment advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
