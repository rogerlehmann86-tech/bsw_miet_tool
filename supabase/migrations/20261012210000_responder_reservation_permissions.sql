-- Buchungen nur für Administratoren schreibbar machen.
-- Einsatzkräfte behalten ausschliesslich das Erstellen von Einsatzsperren;
-- öffentliche Kunden können weiterhin eigene offene Anfragen verwalten.
drop policy if exists reservations_insert on public.reservations;
create policy reservations_insert
on public.reservations
for insert
to authenticated
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'responder'
    and reservation_type = 'emergency_block'
    and status = 'blocked'
    and created_by = auth.uid()
    and updated_by = auth.uid()
  )
  or (
    requester_user_id = auth.uid()
    and created_by = auth.uid()
    and reservation_type = 'rental'
    and status = 'pending'
  )
);

drop policy if exists reservations_update on public.reservations;
create policy reservations_update
on public.reservations
for update
to authenticated
using (
  public.is_admin()
  or (requester_user_id = auth.uid() and status = 'pending')
)
with check (
  public.is_admin()
  or (
    requester_user_id = auth.uid()
    and status = 'pending'
    and reservation_type = 'rental'
  )
);

drop policy if exists reservations_internal_delete on public.reservations;
create policy reservations_internal_delete
on public.reservations
for delete
to authenticated
using (public.is_admin());
