-- =============================================================================
-- Linqora Books — private file storage
--
-- Buckets are PRIVATE. Objects live under "<organization_id>/..." and only
-- members of that business can read them (via short-lived signed URLs); only
-- writers can add or replace them. Nothing here is public.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('business-logos', 'business-logos', false, 512000, array['image/png', 'image/jpeg', 'image/webp']),
  ('receipts', 'receipts', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']),
  ('attachments', 'attachments', false, 20971520, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- First path segment as an organization id; null (deny) if it is not a uuid.
create function public.storage_object_org(p_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;
grant execute on function public.storage_object_org(text) to authenticated;

create policy linqora_files_select on storage.objects for select to authenticated using (
  bucket_id in ('business-logos', 'receipts', 'attachments')
  and public.is_member(public.storage_object_org(name))
);
create policy linqora_files_insert on storage.objects for insert to authenticated with check (
  bucket_id in ('business-logos', 'receipts', 'attachments')
  and public.can_write(public.storage_object_org(name))
);
create policy linqora_files_update on storage.objects for update to authenticated using (
  bucket_id in ('business-logos', 'receipts', 'attachments')
  and public.can_write(public.storage_object_org(name))
) with check (
  bucket_id in ('business-logos', 'receipts', 'attachments')
  and public.can_write(public.storage_object_org(name))
);
create policy linqora_files_delete on storage.objects for delete to authenticated using (
  bucket_id in ('business-logos', 'receipts', 'attachments')
  and public.can_manage(public.storage_object_org(name))
);
