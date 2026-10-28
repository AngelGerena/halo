-- HALO: two reaction kinds (heart + like). Run once in the Supabase SQL editor.
-- Additive + idempotent.
alter table reactions add column if not exists kind text not null default 'heart';
alter table reactions drop constraint if exists reactions_photo_id_device_id_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reactions_photo_device_kind_key') then
    alter table reactions add constraint reactions_photo_device_kind_key unique (photo_id, device_id, kind);
  end if;
end $$;
