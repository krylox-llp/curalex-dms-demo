-- CuraLex: "Request access" submissions from the public landing page.
--
-- Anyone (signed out) can submit through submit_access_request(); only platform admins can read
-- requests and change their status. Not part of the GxP audit trail (no regulated records here),
-- but every request keeps who handled it and when.

create table public.access_requests (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) between 1 and 100),
  email         text not null check (email = lower(btrim(email)) and length(email) <= 254),
  company       text not null check (length(btrim(company)) between 1 and 200),
  company_type  text not null check (company_type in ('manufacturer', 'exporter', 'other')),
  phone         text check (length(phone) <= 30),
  message       text check (length(message) <= 2000),
  status        text not null default 'new' check (status in ('new', 'contacted', 'invited', 'declined')),
  handled_by    uuid references auth.users (id) on delete set null,
  handled_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index access_requests_created_idx on public.access_requests (created_at desc);
create index access_requests_email_idx on public.access_requests (email, created_at desc);

alter table public.access_requests enable row level security;
create policy "platform admins read access requests" on public.access_requests for select to authenticated
  using (public.is_platform_admin());

-- Public submission. Validates input and throttles: 3 per email per day, 100 overall per hour.
create function public.submit_access_request(
  p_name text, p_email text, p_company text, p_company_type text, p_phone text, p_message text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id    uuid;
begin
  if btrim(coalesce(p_name, '')) = '' or btrim(coalesce(p_company, '')) = ''
     or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or coalesce(p_company_type, '') not in ('manufacturer', 'exporter', 'other') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if (select count(*) from public.access_requests where email = v_email and created_at > now() - interval '1 day') >= 3
     or (select count(*) from public.access_requests where created_at > now() - interval '1 hour') >= 100 then
    raise exception 'too_many_requests' using errcode = '54000';
  end if;

  insert into public.access_requests (name, email, company, company_type, phone, message)
  values (btrim(p_name), v_email, btrim(p_company), p_company_type,
          nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_message, '')), ''))
  returning id into v_id;
  return v_id;
exception
  when check_violation then
    raise exception 'invalid_input' using errcode = '22023';
end;
$$;

-- Platform admins track follow-up.
create function public.set_access_request_status(p_request uuid, p_status text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_status not in ('new', 'contacted', 'invited', 'declined') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  update public.access_requests
    set status = p_status, handled_by = auth.uid(), handled_at = now()
    where id = p_request;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Granted to anon as well (the landing page is public; the local Postgres image also crashes on
-- "permission denied for function"). Each function checks its caller.
grant execute on function
  public.submit_access_request(text, text, text, text, text, text),
  public.set_access_request_status(uuid, text)
to anon, authenticated;
