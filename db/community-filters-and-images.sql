-- Applied to Sobrizen with Supabase apply_migration, name community_filters_and_optional_image.
-- Recorded here for review/reproducibility. Do not rerun against an already migrated database.
alter table public.posts
 add column emotion text check (emotion in ('hope','pride','joy','calm','gratitude','sadness','stress','craving','anger','loneliness')),
 add column abstinence_days integer check (abstinence_days between 0 and 50000),
 add column image_path text check (image_path is null or (split_part(image_path,'/',1)=author_id::text and image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.]jpg$')),
 add column image_alt text check (char_length(image_alt)<=180);
comment on column public.posts.abstinence_days is 'Optional self-reported consecutive abstinence days at publication. Explicitly shared by the author; never copied from private tracking or inferred for legacy posts.';
comment on column public.posts.emotion is 'Optional emotion selected explicitly by the author for this message; never inferred from private journal.';
create index posts_emotion_created_idx on public.posts(emotion,created_at desc,id desc);
create index posts_abstinence_created_idx on public.posts(abstinence_days,created_at desc,id desc);
create index posts_image_path_idx on public.posts(image_path) where image_path is not null;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('community-images','community-images',false,2097152,array['image/jpeg']);
create policy community_images_upload_own on storage.objects for insert to authenticated with check (bucket_id='community-images' and (storage.foldername(name))[1]=(select auth.uid())::text and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.]jpg$');
create policy community_images_read_members on storage.objects for select to authenticated using (bucket_id='community-images' and ((storage.foldername(name))[1]=(select auth.uid())::text or exists (select 1 from public.posts p where p.image_path=storage.objects.name)));
create policy community_images_delete_own on storage.objects for delete to authenticated using (bucket_id='community-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
notify pgrst,'reload schema';
