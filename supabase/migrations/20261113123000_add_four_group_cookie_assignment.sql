alter table public.experiment_data
  add column if not exists group_code text;

update public.experiment_data
set group_code = case
  when group_type = 'human' then 'G1'
  when group_type = 'ai' then 'G3'
  else 'G1'
end
where group_code is null;

alter table public.experiment_data
  alter column group_code set default 'G1',
  alter column group_code set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'experiment_data_group_code_check'
      and conrelid = 'public.experiment_data'::regclass
  ) then
    alter table public.experiment_data
      add constraint experiment_data_group_code_check
      check (group_code in ('G1','G2','G3','G4'));
  end if;
end $$;

create index if not exists experiment_data_group_code_created_at_idx
  on public.experiment_data (group_code, created_at desc);
