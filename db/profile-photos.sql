-- Additive production migration: optional_member_profile_photos.
ALTER TABLE public.profiles ADD COLUMN avatar_path text;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_avatar_path_owned CHECK (
 avatar_path IS NULL OR (
   split_part(avatar_path,'/',1)=id::text AND
   avatar_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$'
 )
);
CREATE INDEX profiles_avatar_path_idx ON public.profiles(avatar_path) WHERE avatar_path IS NOT NULL;
COMMENT ON COLUMN public.profiles.avatar_path IS 'Optional member-visible profile image in private profile-avatars storage; owner UUID/immutable UUID.jpg. External avatar_url values are not used by the application.';
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('profile-avatars','profile-avatars',false,524288,ARRAY['image/jpeg']);
CREATE POLICY profile_avatars_upload_own ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='profile-avatars' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$');
CREATE POLICY profile_avatars_read_members ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='profile-avatars' AND ((storage.foldername(name))[1]=(SELECT auth.uid())::text OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.avatar_path=objects.name)));
CREATE POLICY profile_avatars_delete_unused_own ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='profile-avatars' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.avatar_path=objects.name));
NOTIFY pgrst,'reload schema';
