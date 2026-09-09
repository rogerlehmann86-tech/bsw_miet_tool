drop policy "Admins manage access codes" on public.access_codes;
drop policy "Users view assigned active access codes" on public.access_codes;
drop policy "Admins manage access code assignments" on public.access_code_assignments;
drop policy "Users view own active access code assignments" on public.access_code_assignments;

create policy "Authorized users view access codes"
on public.access_codes
for select
to authenticated
using (
  (select public.is_admin())
  or (
    active
    and exists (
      select 1
      from public.access_code_assignments assignment
      where assignment.access_code_id = access_codes.id
        and assignment.user_id = (select auth.uid())
        and assignment.active
    )
  )
);

create policy "Admins insert access codes"
on public.access_codes
for insert
to authenticated
with check ((select public.is_admin()));

create policy "Admins update access codes"
on public.access_codes
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "Admins delete access codes"
on public.access_codes
for delete
to authenticated
using ((select public.is_admin()));

create policy "Authorized users view access code assignments"
on public.access_code_assignments
for select
to authenticated
using (
  (select public.is_admin())
  or (
    active
    and user_id = (select auth.uid())
  )
);

create policy "Admins insert access code assignments"
on public.access_code_assignments
for insert
to authenticated
with check ((select public.is_admin()));

create policy "Admins update access code assignments"
on public.access_code_assignments
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "Admins delete access code assignments"
on public.access_code_assignments
for delete
to authenticated
using ((select public.is_admin()));

create index access_codes_created_by_idx on public.access_codes (created_by);
create index access_codes_updated_by_idx on public.access_codes (updated_by);
create index access_code_assignments_created_by_idx
  on public.access_code_assignments (created_by);
create index access_code_assignments_updated_by_idx
  on public.access_code_assignments (updated_by);
