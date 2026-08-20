update public.jelly_stats
set
  total_pokes = 0,
  fortune_baht = 0,
  updated_at = now()
where id = 'singleton';
