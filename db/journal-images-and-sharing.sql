-- Additive production migration: journal_private_images_and_optional_sharing.
-- The application keeps every journal row private. Sharing creates a separate post.
alter table public.journal_entries
  add column image_path text check (
    image_path is null or (
      split_part(image_path,'/',1)=user_id::text
      and image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$'
    )
  ),
  add column image_alt text check (char_length(image_alt)<=180),
  add column shared_post_id uuid references public.posts(id) on delete set null;

comment on column public.journal_entries.image_path is 'Optional owner-only image in the private journal-images bucket. Never a public URL or community object path.';
comment on column public.journal_entries.shared_post_id is 'Private reference to the most recently published independent copy, after explicit author confirmation. Never synchronizes journal text or images into a post.';

create index journal_entries_image_path_idx on public.journal_entries(image_path) where image_path is not null;
create index journal_entries_shared_post_idx on public.journal_entries(shared_post_id) where shared_post_id is not null;

create function private.validate_journal_shared_post()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  -- ON DELETE SET NULL must also work when the publication is removed.
  if new.shared_post_id is null then return new; end if;
  if auth.uid() is not null and new.user_id is distinct from auth.uid() then
    raise exception 'Cette note ne t’appartient pas.' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.posts p
    where p.id=new.shared_post_id and p.author_id=new.user_id
  ) then
    raise exception 'La copie partagée doit appartenir au propriétaire de la note.' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_journal_shared_post() from public, anon, authenticated;
create trigger journal_validate_shared_post
before insert or update of shared_post_id,user_id on public.journal_entries
for each row execute function private.validate_journal_shared_post();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('journal-images','journal-images',false,2097152,array['image/jpeg']);

create policy journal_images_upload_own on storage.objects
for insert to authenticated
with check (
  bucket_id='journal-images'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$'
);
create policy journal_images_read_own on storage.objects
for select to authenticated
using (bucket_id='journal-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy journal_images_delete_own on storage.objects
for delete to authenticated
using (bucket_id='journal-images' and (storage.foldername(name))[1]=(select auth.uid())::text);

notify pgrst,'reload schema';
