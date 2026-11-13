drop policy if exists experiment_admin_read on public.experiment_data;

create policy experiment_admin_read
on public.experiment_data
for select
to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop index if exists public.experiment_data_group_code_created_at_idx;
