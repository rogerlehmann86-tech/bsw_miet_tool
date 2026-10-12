create extension if not exists pg_cron;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'mark-ended-rentals-to-bill'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

update public.reservations
set status = 'to_bill'
where reservation_type = 'rental'
  and status = 'confirmed'
  and ends_at <= now();

select cron.schedule(
  'mark-ended-rentals-to-bill',
  '* * * * *',
  $job$
    update public.reservations
    set status = 'to_bill'
    where reservation_type = 'rental'
      and status = 'confirmed'
      and ends_at <= now();
  $job$
);
