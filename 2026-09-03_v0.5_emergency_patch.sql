-- GVöS Miettool v0.5
-- Globale Einsatzsperren dürfen bestehende Vermietungen überlagern.

create or replace function public.check_reservation_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  related_id uuid;
  remaining integer;
  product_is_active boolean;
begin
  if new.ends_at <= new.starts_at then
    raise exception 'Das Ende der Reservation muss nach dem Beginn liegen.';
  end if;

  if new.status not in ('pending', 'confirmed', 'blocked') then
    return new;
  end if;

  select p.active into product_is_active
  from public.products p
  where p.id = new.product_id;

  if product_is_active is null then
    raise exception 'Das ausgewählte Mietobjekt existiert nicht.';
  end if;

  if product_is_active = false and not public.is_internal_user() then
    raise exception 'Das ausgewählte Mietobjekt ist nicht aktiv.';
  end if;

  -- Eine Einsatzsperre hat Vorrang und darf bestehende Buchungen überlagern.
  if new.reservation_type = 'emergency_block' then
    return new;
  end if;

  for related_id in
    select rel.product_id
    from public.related_product_ids(new.product_id) rel
    order by rel.product_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(related_id::text, 0));
  end loop;

  remaining := public.available_quantity(
    new.product_id,
    new.starts_at,
    new.ends_at,
    case when tg_op = 'UPDATE' then new.id else null end
  );

  if remaining < new.quantity then
    raise exception 'Das Mietobjekt ist im gewählten Zeitraum nicht mehr ausreichend verfügbar.';
  end if;

  return new;
end;
$$;

select 'v0.5 emergency patch installed' as result;
