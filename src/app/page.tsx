import type { Metadata } from 'next';
import { HeroClock } from '@/components/HeroClock';
import { BreakingNewsBanner } from '@/components/BreakingNewsBanner';
import { OpinionBanner } from '@/components/OpinionBanner';
import { NewsletterSignup } from '@/components/NewsletterSignup';
import { NewsletterInlineCTA } from '@/components/NewsletterInlineCTA';
import { ShareBar } from '@/components/ShareBar';
import { NewsFeed } from '@/components/NewsFeed';
import { SectorBreakdown } from '@/components/SectorBreakdown';
import { Rss } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export const metadata: Metadata = {
  title: "AI Job Clock — Real-Time AI Job Displacement Tracker",
  description:
    "Real-time AI job displacement tracker. See how automation is reshaping the global workforce across technology, finance, healthcare, manufacturing, and more.",
  alternates: { canonical: "https://aijobclock.com" },
  openGraph: {
    title: "AI Job Clock — Real-Time AI Job Displacement Tracker",
    description:
      "Real-time AI job displacement tracker. See how automation is reshaping the global workforce across technology, finance, healthcare, manufacturing, and more.",
    url: "https://aijobclock.com",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Job Clock — Real-Time AI Job Displacement Tracker",
    description:
      "Real-time AI job displacement tracker. See how automation is reshaping the global workforce across technology, finance, healthcare, manufacturing, and more.",
  },
};

const FAQ_ITEMS = [
  {
    q: 'What is AI Job Clock?',
    a: "AI Job Clock is a live, real-time tracker that visualizes global AI-driven job displacement. It shows estimated employment figures based on current displacement rates, sector breakdowns, and aggregated news about AI's impact on employment.",
  },
  {
    q: 'How accurate is the AI job displacement estimate?',
    a: 'The figures are speculative extrapolations based on aggregated news signals and labor reports — not predictions. They do not account for new job creation, policy changes, or economic shifts. This is a data observatory, not a forecast.',
  },
  {
    q: 'Which sectors are most at risk from AI automation?',
    a: 'We track nine sectors: Technology, Finance, Healthcare, Manufacturing, Retail, Media, Legal, Education, and Transportation. Each sector is weighted by article volume and known automation exposure from research by McKinsey and the World Economic Forum.',
  },
  {
    q: 'Where does the data come from?',
    a: 'Our automated system aggregates AI-related employment news from major outlets, categorizes stories by sector, and extracts displacement signals. The baseline of ~4 billion employed people comes from International Labour Organization (ILO) estimates.',
  },
  {
    q: 'How often is the data updated?',
    a: 'News articles are scraped and processed daily. The displacement rate is recalculated as new data arrives. The clock itself ticks every second based on the latest rate.',
  },
  {
    q: 'Can I embed AI Job Clock on my website?',
    a: 'Yes. Click the "Embed" button on the homepage to get an iframe snippet you can paste into any website or blog post.',
  },
];

const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ITEMS.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
};

const NAV_LINKS = [
  { href: '/', label: 'Clock' },
  { href: '/blog', label: 'Blog' },
  { href: '/methodology', label: 'Methodology' },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />
      <BreakingNewsBanner />
      <OpinionBanner />
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <Link href="/" className="shrink-0">
            <h1
              className="text-base sm:text-lg font-black tracking-tight"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              AI Job Clock
            </h1>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground/60 tracking-wide hidden sm:block">
              Tracking AI&apos;s impact on global employment
            </p>
          </Link>
          <nav className="flex items-center gap-0.5 sm:gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-1.5 sm:px-2.5 py-1 sm:py-1.5 text-[11px] sm:text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted"
              >
                {link.label}
              </Link>
            ))}
            <div className="w-px h-4 bg-border mx-0.5 sm:mx-1" />
            <a
              href="/api/rss"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 sm:p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted"
              title="RSS Feed"
            >
              <Rss className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </a>
            <ThemeToggle />
            <ShareBar />
          </nav>
        </div>
      </header>

      <main>
      <HeroClock />

      {/* SEO intro paragraph */}
      <section className="border-b border-border py-8">
        <div className="mx-auto max-w-3xl px-6">
          <p className="text-sm text-foreground/70 leading-relaxed text-center">
            AI Job Clock is a <strong>real-time employment tracker</strong> monitoring{' '}
            <strong>AI job displacement</strong> across nine global sectors. As{' '}
            <strong>job automation statistics</strong> shift daily, this live counter reflects the
            latest <strong>AI workforce trends</strong> — drawing on ILO employment baselines,
            aggregated news signals, and labor market research to visualize the scale of{' '}
            <strong>AI-driven job displacement</strong> in real time.
          </p>
        </div>
      </section>

      <NewsletterInlineCTA />
      <NewsFeed />
      <SectorBreakdown />

      {/* SEO content section */}
      <section className="border-t border-border py-12">
        <div className="mx-auto max-w-3xl px-6 space-y-6">
          <h2
            className="text-2xl font-bold tracking-tight"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            About AI Job Clock
          </h2>
          <div className="space-y-4 text-sm text-foreground/80 leading-relaxed">
            <p>
              AI Job Clock is a <strong>live AI job displacement tracker</strong> that visualizes
              how artificial intelligence and automation are reshaping the global workforce. Starting
              from a baseline of approximately 4 billion employed people worldwide — sourced from{' '}
              <abbr title="International Labour Organization">ILO</abbr> estimates — the clock
              updates every second at a rate derived from aggregated news signals, corporate
              announcements, and labor market data.
            </p>
            <p>
              The tracker breaks down <strong>jobs at risk from AI by sector</strong>, covering
              Technology, Finance, Healthcare, Manufacturing, Retail, Media, Legal, Education, and
              Transportation. Each sector is weighted by article volume and automation exposure
              indexes from research institutions like McKinsey Global Institute and the World
              Economic Forum.
            </p>
            <p>
              Whether you&apos;re a journalist covering the <strong>AI automation impact</strong>, a
              policymaker studying workforce transitions, a researcher analyzing{' '}
              <strong>AI displacement</strong> trends, or simply curious about the future of work —
              AI Job Clock provides a real-time, data-driven lens on one of the defining economic
              questions of our era.
            </p>
            <p>
              Our{' '}
              <Link href="/blog" className="underline hover:text-foreground">
                daily briefings
              </Link>{' '}
              digest the latest AI employment news into concise, sector-specific summaries. For a
              deeper understanding of the numbers, visit our{' '}
              <Link href="/methodology" className="underline hover:text-foreground">
                methodology page
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      {/* FAQ section */}
      <section className="border-t border-border py-12">
        <div className="mx-auto max-w-3xl px-6">
          <h2
            className="text-2xl font-bold tracking-tight mb-6"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Frequently Asked Questions
          </h2>
          <Accordion className="w-full">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left text-sm font-medium">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-foreground/70 leading-relaxed">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
      </main>

      <footer className="border-t border-border py-10">
        <div className="mx-auto max-w-5xl px-6">
          <NewsletterSignup />
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6 mt-6 text-xs text-muted-foreground">
            <Link href="/methodology" className="hover:text-foreground transition-colors">
              Methodology
            </Link>
            <Link href="/blog" className="hover:text-foreground transition-colors">
              Blog
            </Link>
            <a
              href="/api/rss"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              RSS
            </a>
          </div>
          <p className="text-[10px] text-muted-foreground/40 text-center mt-4 max-w-lg mx-auto leading-relaxed">
            Data sourced from ILO baselines and aggregated news signals. All projections are
            speculative models, not predictions. Not financial or employment advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
