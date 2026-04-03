'use client';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export function useBreakingNews() {
  return useQuery({
    queryKey: ['breaking-news'],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('breaking_news')
        .select('*')
        .eq('active', true)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    refetchInterval: 60000,
  });
}
