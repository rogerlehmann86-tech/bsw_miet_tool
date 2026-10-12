alter table public.reservations
  drop constraint if exists reservations_status_check;

alter table public.reservations
  add constraint reservations_status_check
  check (
    status = any (
      array[
        'pending',
        'confirmed',
        'blocked',
        'cancelled',
        'to_bill',
        'billed'
      ]::text[]
    )
  );

create or replace function public.available_quantity(
  requested_product_id uuid,
  requested_start timestamp with time zone,
  requested_end timestamp with time zone,
  excluded_reservation_id uuid default null
)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  total_quantity integer;
  occupied_quantity integer;
begin
  if requested_start is null
     or requested_end is null
     or requested_end <= requested_start then
    return 0;
  end if;

  select p.quantity
  into total_quantity
  from public.products p
  where p.id = requested_product_id
    and (p.active = true or public.is_internal_user());

  if total_quantity is null then
    return 0;
  end if;

  select coalesce(sum(r.quantity), 0)::integer
  into occupied_quantity
  from public.reservations r
  where r.product_id in (
    select rel.product_id
    from public.related_product_ids(requested_product_id) rel
  )
    and r.status in ('pending', 'confirmed', 'blocked', 'to_bill', 'billed')
    and r.starts_at < requested_end
    and r.ends_at > requested_start
    and (
      excluded_reservation_id is null
      or r.id <> excluded_reservation_id
    );

  return greatest(total_quantity - occupied_quantity, 0);
end;
$function$;
