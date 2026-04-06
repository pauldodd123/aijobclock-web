'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { z } from 'zod';

const emailSchema = z.string().trim().email('Please enter a valid email').max(255);

export function NewsletterInlineCTA() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast.error('Invalid email', { description: parsed.error.issues[0].message });
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await (supabase as any).from('newsletter_subscribers').insert({
      email: parsed.data,
      frequency: 'weekly',
      sectors: ['All'],
    });
    setLoading(false);
    if (error) {
      if (error.code === '23505') {
        toast("Already subscribed", { description: "You're already on the list!" });
        setSubscribed(true);
      } else {
        toast.error('Error', { description: 'Something went wrong. Please try again.' });
      }
      return;
    }
    setSubscribed(true);
    toast('Subscribed!', { description: "You'll receive weekly AI job market updates." });
    setEmail('');
  };

  return (
    <section className="border-b border-border bg-secondary/40">
      <div className="mx-auto max-w-5xl px-6 py-5 sm:py-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
        <div className="shrink-0 text-center sm:text-left">
          <p
            className="text-sm font-bold tracking-tight"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Get AI job market insights delivered weekly
          </p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            Sector briefings, displacement trends, and news digests.
          </p>
        </div>
        <div className="w-full sm:w-auto sm:flex-1 sm:max-w-sm">
          {subscribed ? (
            <p className="text-xs text-muted-foreground text-center sm:text-left">
              ✓ You&apos;re on the list.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-9 text-xs rounded-full bg-background border-border"
              />
              <Button
                type="submit"
                disabled={loading}
                size="sm"
                className="rounded-full px-5 text-xs shrink-0"
              >
                {loading ? 'Subscribing…' : 'Subscribe'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
