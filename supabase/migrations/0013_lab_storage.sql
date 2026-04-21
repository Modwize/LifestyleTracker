-- 0013_lab_storage.sql
-- Private storage bucket for lab-report PDFs + RLS so users can only read
-- their own objects. Objects are pathed as: <user_id>/<draw_id>.pdf

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lab-reports', 'lab-reports', false, 10 * 1024 * 1024, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Users can read/write only objects inside their own folder (first path segment = user_id).
drop policy if exists "lab_reports_owner_select" on storage.objects;
create policy "lab_reports_owner_select" on storage.objects
  for select using (
    bucket_id = 'lab-reports'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "lab_reports_owner_insert" on storage.objects;
create policy "lab_reports_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'lab-reports'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "lab_reports_owner_delete" on storage.objects;
create policy "lab_reports_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'lab-reports'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
