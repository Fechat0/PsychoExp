-- Server-side, balanced four-arm allocation. Existing submitted participants seed the
-- assignment ledger so future assignments balance against the current sample.
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.participant_group_assignments (
  subject_id text primary key check (char_length(subject_id) between 1 and 64),
  group_code text not null check (group_code in ('G1','G2','G3','G4')),
  created_at timestamptz not null default now()
);

revoke all on table private.participant_group_assignments from public, anon, authenticated;
grant select, insert on table private.participant_group_assignments to service_role;

insert into private.participant_group_assignments (subject_id, group_code, created_at)
select subject_id, group_code, coalesce(created_at, now())
from public.experiment_data
where group_code in ('G1','G2','G3','G4')
on conflict (subject_id) do nothing;

create or replace function public.assign_participant_group(p_subject_id text)
returns text
language plpgsql
security invoker
set search_path = pg_catalog, private
as $$
declare
  v_existing text;
  v_candidates text[];
  v_selected text;
begin
  if p_subject_id is null or char_length(btrim(p_subject_id)) < 1 or char_length(p_subject_id) > 64 then
    raise exception 'Invalid participant ID';
  end if;

  -- Serialize allocations to avoid two simultaneous participants seeing the same counts.
  perform pg_advisory_xact_lock(19072611, 1);

  select group_code
    into v_existing
    from private.participant_group_assignments
   where subject_id = btrim(p_subject_id);

  if found then
    return v_existing;
  end if;

  with group_counts as (
    select groups.group_code, count(assignments.subject_id)::bigint as assigned_count
      from (values ('G1'), ('G2'), ('G3'), ('G4')) as groups(group_code)
      left join private.participant_group_assignments as assignments
        on assignments.group_code = groups.group_code
     group by groups.group_code
  )
  select array_agg(group_code order by group_code)
    into v_candidates
    from group_counts
   where assigned_count = (select min(assigned_count) from group_counts);

  if coalesce(cardinality(v_candidates), 0) = 0 then
    raise exception 'Unable to select an experiment group';
  end if;

  v_selected := v_candidates[1 + floor(random() * cardinality(v_candidates))::integer];

  insert into private.participant_group_assignments (subject_id, group_code)
  values (btrim(p_subject_id), v_selected);

  return v_selected;
end;
$$;

revoke all on function public.assign_participant_group(text) from public, anon, authenticated;
grant execute on function public.assign_participant_group(text) to service_role;
