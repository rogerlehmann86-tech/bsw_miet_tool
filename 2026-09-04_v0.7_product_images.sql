-- GVöS Miettool v0.7: Bilder für Mietobjekte

alter table public.products
  add column if not exists image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Administratoren laden Mietobjektbilder hoch" on storage.objects;
create policy "Administratoren laden Mietobjektbilder hoch" on storage.objects for insert to authenticated
with check (bucket_id='product-images' and exists (select 1 from public.profiles where profiles.id=auth.uid() and profiles.role='admin' and profiles.active=true));

drop policy if exists "Administratoren ändern Mietobjektbilder" on storage.objects;
create policy "Administratoren ändern Mietobjektbilder" on storage.objects for update to authenticated
using (bucket_id='product-images' and exists (select 1 from public.profiles where profiles.id=auth.uid() and profiles.role='admin' and profiles.active=true))
with check (bucket_id='product-images' and exists (select 1 from public.profiles where profiles.id=auth.uid() and profiles.role='admin' and profiles.active=true));

drop policy if exists "Administratoren löschen Mietobjektbilder" on storage.objects;
create policy "Administratoren löschen Mietobjektbilder" on storage.objects for delete to authenticated
using (bucket_id='product-images' and exists (select 1 from public.profiles where profiles.id=auth.uid() and profiles.role='admin' and profiles.active=true));

select 'v0.7 product images installed' as result;
