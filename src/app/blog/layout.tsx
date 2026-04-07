import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI & Jobs Daily Briefings',
  description:
    'Daily AI-generated briefings on how artificial intelligence is impacting jobs across technology, finance, healthcare, manufacturing, and more sectors.',
  alternates: { canonical: 'https://aijobclock.com/blog' },
  openGraph: {
    title: 'AI & Jobs Daily Briefings | AI Job Clock',
    description:
      'Daily AI-generated briefings on how artificial intelligence is impacting jobs across technology, finance, healthcare, manufacturing, and more sectors.',
    url: 'https://aijobclock.com/blog',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI & Jobs Daily Briefings | AI Job Clock',
    description:
      'Daily AI-generated briefings on how artificial intelligence is impacting jobs across technology, finance, healthcare, manufacturing, and more sectors.',
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
