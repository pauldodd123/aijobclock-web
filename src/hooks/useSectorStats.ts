'use client';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export function useSectorStats() {
  return useQuery({
    queryKey: ['sector-stats'],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('sector_stats')
        .select('*')
        .order('estimated_jobs_at_risk', { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });
}
