create table public.access_codes (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(trim(label)) between 1 and 120),
  location text not null default '' check (char_length(location) <= 180),
  code_value text not null check (char_length(code_value) between 1 and 100),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.access_code_assignments (
  access_code_id uuid not null references public.access_codes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (access_code_id, user_id)
);

create index access_code_assignments_user_active_idx
  on public.access_code_assignments (user_id, active);

create trigger set_access_codes_updated_at
before update on public.access_codes
for each row execute function public.set_updated_at();

create trigger set_access_code_assignments_updated_at
before update on public.access_code_assignments
for each row execute function public.set_updated_at();

alter table public.access_codes enable row level security;
alter table public.access_code_assignments enable row level security;

create policy "Admins manage access codes"
on public.access_codes
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "Users view assigned active access codes"
on public.access_codes
for select
to authenticated
using (
  active
  and exists (
    select 1
    from public.access_code_assignments assignment
    where assignment.access_code_id = access_codes.id
      and assignment.user_id = (select auth.uid())
      and assignment.active
  )
);

create policy "Admins manage access code assignments"
on public.access_code_assignments
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "Users view own active access code assignments"
on public.access_code_assignments
for select
to authenticated
using (
  active
  and user_id = (select auth.uid())
);

revoke all on public.access_codes from anon;
revoke all on public.access_code_assignments from anon;
grant select, insert, update, delete on public.access_codes to authenticated;
grant select, insert, update, delete on public.access_code_assignments to authenticated;
grant select, insert, update, delete on public.access_codes to service_role;
grant select, insert, update, delete on public.access_code_assignments to service_role;
