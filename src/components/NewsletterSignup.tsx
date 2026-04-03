'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';
import { z } from 'zod';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const emailSchema = z.string().trim().email('Please enter a valid email').max(255);
const SECTORS = ['All', 'Tech', 'Finance', 'Healthcare', 'Manufacturing', 'Retail', 'Media', 'Legal', 'Education', 'Transportation'];

export function NewsletterSignup() {
  const [email, setEmail] = useState('');
  const [frequency, setFrequency] = useState('weekly');
  const [sector, setSector] = useState('All');
  const [loading, setLoading] = useState(false);

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
      frequency,
      sectors: sector === 'All' ? ['All'] : [sector],
    });
    setLoading(false);
    if (error) {
      if (error.code === '23505') {
        toast("Already subscribed", { description: "You're already on the list!" });
      } else {
        toast.error('Error', { description: 'Something went wrong. Please try again.' });
      }
      return;
    }
    toast('Subscribed!', { description: `You'll receive ${frequency} updates on ${sector === 'All' ? 'all sectors' : sector}.` });
    setEmail('');
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="flex items-center gap-2 mb-3 justify-center">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-bold tracking-tight" style={{ fontFamily: 'var(--font-serif)' }}>Stay informed</h3>
      </div>
      <p className="text-xs text-muted-foreground/60 text-center mb-4">Get updates on AI-driven workforce changes.</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2">
          <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-9 text-xs rounded-full bg-secondary border-border" />
          <Button type="submit" disabled={loading} size="sm" className="rounded-full px-5 text-xs shrink-0">
            {loading ? 'Subscribing…' : 'Subscribe'}
          </Button>
        </div>
        <div className="flex gap-2">
          <Select value={frequency} onValueChange={(v) => { if (v) setFrequency(v); }}>
            <SelectTrigger className="h-8 text-xs rounded-full bg-secondary border-border flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sector} onValueChange={(v) => { if (v) setSector(v); }}>
            <SelectTrigger className="h-8 text-xs rounded-full bg-secondary border-border flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SECTORS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </form>
    </div>
  );
}
