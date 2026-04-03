import { HeroClock } from '@/components/HeroClock';
import { BreakingNewsBanner } from '@/components/BreakingNewsBanner';
import { OpinionBanner } from '@/components/OpinionBanner';
import { NewsletterSignup } from '@/components/NewsletterSignup';
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
