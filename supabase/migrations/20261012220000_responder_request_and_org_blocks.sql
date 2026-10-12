-- Einsatzkräfte dürfen offene Mietanfragen und Sperren für ihre eigene
-- Organisation erfassen. Bestehende Einträge bleiben Administratoren vorbehalten.
drop policy if exists reservations_insert on public.reservations;
create policy reservations_insert
on public.reservations
for insert
to authenticated
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'responder'
    and created_by = auth.uid()
    and updated_by = auth.uid()
    and (
      (
        reservation_type = 'rental'
        and status = 'pending'
        and requester_user_id = auth.uid()
      )
      or (
        reservation_type = 'self_block'
        and status = 'blocked'
        and nullif(trim(organisation), '') = (
          select nullif(trim(p.organisation), '')
          from public.profiles p
          where p.id = auth.uid()
            and p.active = true
        )
      )
      or (
        reservation_type = 'emergency_block'
        and status = 'blocked'
      )
    )
  )
  or (
    public.current_user_role() = 'customer'
    and requester_user_id = auth.uid()
    and created_by = auth.uid()
    and reservation_type = 'rental'
    and status = 'pending'
  )
);