-- Jalankan di Supabase: SQL Editor > New query > paste > Run
create table if not exists public.user_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  version    integer     not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

-- tiap user hanya bisa membaca dan mengubah barisnya sendiri
create policy "own select" on public.user_state
  for select to authenticated using (auth.uid() = user_id);
create policy "own insert" on public.user_state
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own update" on public.user_state
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own delete" on public.user_state
  for delete to authenticated using (auth.uid() = user_id);
