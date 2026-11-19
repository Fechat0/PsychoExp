alter table public.experiment_data
  add column if not exists is_excluded boolean not null default false,
  add column if not exists exclusion_reason text not null default '',
  add column if not exists excluded_at timestamptz,
  add column if not exists excluded_by uuid;

alter table public.experiment_data
  drop constraint if exists experiment_data_exclusion_reason_length_check;

alter table public.experiment_data
  add constraint experiment_data_exclusion_reason_length_check
  check (char_length(exclusion_reason) <= 1000);

-- Keep ordinary participant rows read-only. The only mutable data exposed to
-- authenticated admins is the exclusion metadata.
revoke update, delete on table public.experiment_data from anon, authenticated;
grant update (is_excluded, exclusion_reason, excluded_at, excluded_by)
  on table public.experiment_data to authenticated;
grant delete on table public.experiment_data to authenticated;

drop policy if exists experiment_admin_update on public.experiment_data;
create policy experiment_admin_update
  on public.experiment_data
  for update
  to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists experiment_admin_delete on public.experiment_data;
create policy experiment_admin_delete
  on public.experiment_data
  for delete
  to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

notify pgrst, 'reload schema';