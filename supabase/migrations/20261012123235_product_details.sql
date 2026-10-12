begin;

create or replace function public.valid_product_documents(p_product_id uuid, p_documents jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  document jsonb;
begin
  if jsonb_typeof(p_documents) is distinct from 'array' then
    return false;
  end if;
  if jsonb_array_length(p_documents) > 10 then
    return false;
  end if;

  for document in select value from jsonb_array_elements(p_documents) loop
    if jsonb_typeof(document) is distinct from 'object'
       or jsonb_typeof(document->'title') is distinct from 'string'
       or length(trim(document->>'title')) not between 1 and 160
       or jsonb_typeof(document->'path') is distinct from 'string'
       or (document->>'path') !~ ('^' || p_product_id::text || '/[a-f0-9-]{36}[.]pdf$') then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.valid_product_documents(uuid, jsonb) from public, anon;
grant execute on function public.valid_product_documents(uuid, jsonb) to authenticated, service_role;

create table if not exists public.product_details (
  product_id uuid primary key references public.products(id) on delete cascade,
  description text not null default '' check (length(description) <= 12000),
  specifications text not null default '' check (length(specifications) <= 12000),
  documents jsonb not null default '[]'::jsonb
    check (public.valid_product_documents(product_id, documents))
);

alter table public.product_details enable row level security;
revoke all on public.product_details from public, anon, authenticated;
grant select, insert, update, delete on public.product_details to authenticated;
grant all on public.product_details to service_role;

drop policy if exists product_details_active_read on public.product_details;
create policy product_details_active_read
on public.product_details for select to authenticated
using (exists (
  select 1 from public.products product
  where product.id = product_id and product.active = true
));

drop policy if exists product_details_admin_manage on public.product_details;
create policy product_details_admin_manage
on public.product_details for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-documents', 'product-documents', true, 20971520, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_documents_admin_insert on storage.objects;
create policy product_documents_admin_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'product-documents' and (select public.is_admin()));

drop policy if exists product_documents_admin_delete on storage.objects;
create policy product_documents_admin_delete
on storage.objects for delete to authenticated
using (bucket_id = 'product-documents' and (select public.is_admin()));

notify pgrst, 'reload schema';
commit;
