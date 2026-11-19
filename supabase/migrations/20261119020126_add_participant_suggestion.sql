alter table public.experiment_data
  add column if not exists participant_suggestion text not null default '';

alter table public.experiment_data
  drop constraint if exists experiment_data_participant_suggestion_length_check;

alter table public.experiment_data
  add constraint experiment_data_participant_suggestion_length_check
  check (char_length(participant_suggestion) <= 2000);
