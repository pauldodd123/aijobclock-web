'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useBlogPosts } from '@/hooks/useBlogPosts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ThemeToggle } from '@/components/ThemeToggle';


const SECTORS = [
  'All',
  'Tech',
  'Finance',
  'Healthcare',
  'Manufacturing',
  'Retail',
  'Media',
  'Legal',
  'Education',
  'Transportation',
];


export default function BlogPage() {
  const [activeSector, setActiveSector] = useState('All');
  const { data: posts, isLoading } = useBlogPosts(activeSector);


  const grouped = (posts ?? []).reduce<Record<string, typeof posts>>((acc, post) => {
    const date = post.published_date;
    if (!acc[date]) acc[date] = [];
    acc[date]!.push(post);
    return acc;
  }, {});


  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

