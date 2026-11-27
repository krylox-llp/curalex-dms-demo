-- CuraLex: companies, members and invitations.
--
-- Access is invite-only:
--   * Platform admins (the app owner) invite companies: manufacturers or exporters.
--   * Manufacturers invite the exporters they work with.
--   * A user joins a company by signing in with the Google account the invite was sent to.
--
-- Clients can only READ through RLS. Every write goes through the SECURITY DEFINER
-- functions below, which check who is calling.

create type public.org_type as enum ('manufacturer', 'exporter');

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 200),
  type        public.org_type not null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- One company per user for now.
create table public.memberships (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index memberships_org_id_idx on public.memberships (org_id);

create table public.invitations (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  email              text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  invited_by         uuid references auth.users (id) on delete set null,
  -- null when a platform admin sent it; the manufacturer's org when a manufacturer did.
  invited_by_org_id  uuid references public.organizations (id) on delete set null,
  accepted_at        timestamptz,
  accepted_by        uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now()
);
create unique index invitations_one_pending_per_email
  on public.invitations (email) where accepted_at is null;
create index invitations_org_id_idx on public.invitations (org_id);

-- Which exporters a manufacturer works with (and so may share documents with).
create table public.org_relationships (
  manufacturer_org_id  uuid not null references public.organizations (id) on delete cascade,
  exporter_org_id      uuid not null references public.organizations (id) on delete cascade,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  primary key (manufacturer_org_id, exporter_org_id)
);
create index org_relationships_exporter_idx on public.org_relationships (exporter_org_id);

-- App owners. Add yourself after running this migration:
--   insert into public.platform_admins (email) values ('you@example.com');
create table public.platform_admins (
  email       text primary key check (email = lower(btrim(email))),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.current_email() returns text
language sql stable security definer set search_path = ''
as $$
  -- Only trust emails Supabase has confirmed (always true for Google sign-in).
  select lower(u.email) from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null
$$;

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins a where a.email = public.current_email()
  )
$$;

create function public.current_org_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.org_id from public.memberships m where m.user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Row level security: read-only access, scoped to the caller's company
-- ---------------------------------------------------------------------------

alter table public.organizations     enable row level security;
alter table public.memberships       enable row level security;
alter table public.invitations       enable row level security;
alter table public.org_relationships enable row level security;
alter table public.platform_admins   enable row level security; -- no policies: not readable by clients

create policy "read own, related or (admin) all organizations"
  on public.organizations for select to authenticated
  using (
    public.is_platform_admin()
    or id = public.current_org_id()
    or exists (
      select 1 from public.org_relationships r
      where (r.manufacturer_org_id = public.current_org_id() and r.exporter_org_id = organizations.id)
         or (r.exporter_org_id = public.current_org_id() and r.manufacturer_org_id = organizations.id)
    )
  );

create policy "read own membership"
  on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

create policy "read invitations you sent"
  on public.invitations for select to authenticated
  using (public.is_platform_admin() or invited_by_org_id = public.current_org_id());

create policy "read your relationships"
  on public.org_relationships for select to authenticated
  using (
    public.is_platform_admin()
    or manufacturer_org_id = public.current_org_id()
    or exporter_org_id = public.current_org_id()
  );

-- ---------------------------------------------------------------------------
-- Account
-- ---------------------------------------------------------------------------

-- The signed-in user's company (if any) and whether they are a platform admin.
create function public.my_account() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'email', public.current_email(),
    'is_admin', public.is_platform_admin(),
    'org', (
      select jsonb_build_object('id', o.id, 'name', o.name, 'type', o.type)
      from public.memberships m
      join public.organizations o on o.id = m.org_id
      where m.user_id = auth.uid()
    )
  )
$$;

-- Called after sign-in: joins the company from a pending invitation for this email.
create function public.accept_invitation() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := public.current_email();
  v_invite public.invitations;
begin
  if auth.uid() is null or v_email is null then
    return public.my_account();
  end if;

  if exists (select 1 from public.memberships where user_id = auth.uid()) then
    return public.my_account();
  end if;

  select * into v_invite from public.invitations
  where email = v_email and accepted_at is null
  for update;

  if found then
    insert into public.memberships (user_id, org_id) values (auth.uid(), v_invite.org_id);
    update public.invitations
      set accepted_at = now(), accepted_by = auth.uid()
      where id = v_invite.id;
  end if;

  return public.my_account();
end;
$$;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

-- Platform admin invites a company (manufacturer or exporter) by its contact email.
create function public.admin_invite_company(p_name text, p_email text, p_type public.org_type)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_name  text := btrim(p_name);
  v_org   uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_name = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.memberships m join auth.users u on u.id = m.user_id
    where lower(u.email) = v_email
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;
  if exists (select 1 from public.invitations where email = v_email and accepted_at is null) then
    raise exception 'already_invited' using errcode = '23505';
  end if;

  insert into public.organizations (name, type, created_by)
    values (v_name, p_type, auth.uid())
    returning id into v_org;
  insert into public.invitations (org_id, email, invited_by)
    values (v_org, v_email, auth.uid());

  return jsonb_build_object('status', 'invited', 'org_id', v_org, 'email', v_email);
end;
$$;

-- Manufacturer invites an exporter by company name and point-of-contact email.
-- If that email already belongs to (or is invited to) an exporter on CuraLex,
-- the manufacturer is linked to that existing exporter instead of creating a duplicate.
create function public.invite_exporter(p_company text, p_email text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_email      text := lower(btrim(p_email));
  v_company    text := btrim(p_company);
  v_my_org     uuid := public.current_org_id();
  v_target     uuid;
  v_target_type public.org_type;
  v_status     text;
  v_inserted   int;
begin
  if v_my_org is null
     or (select type from public.organizations where id = v_my_org) <> 'manufacturer' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_company = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  -- Existing member with this email?
  select m.org_id, o.type into v_target, v_target_type
  from public.memberships m
  join auth.users u on u.id = m.user_id
  join public.organizations o on o.id = m.org_id
  where lower(u.email) = v_email;

  -- Otherwise, a pending invitation for this email?
  if v_target is null then
    select i.org_id, o.type into v_target, v_target_type
    from public.invitations i
    join public.organizations o on o.id = i.org_id
    where i.email = v_email and i.accepted_at is null;
  end if;

  if v_target is not null and v_target_type <> 'exporter' then
    raise exception 'not_an_exporter' using errcode = '23514';
  end if;

  if v_target is null then
    insert into public.organizations (name, type, created_by)
      values (v_company, 'exporter', auth.uid())
      returning id into v_target;
    insert into public.invitations (org_id, email, invited_by, invited_by_org_id)
      values (v_target, v_email, auth.uid(), v_my_org);
    v_status := 'invited';
  else
    v_status := 'linked_existing';
  end if;

  insert into public.org_relationships (manufacturer_org_id, exporter_org_id, created_by)
    values (v_my_org, v_target, auth.uid())
    on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    raise exception 'already_linked' using errcode = '23505';
  end if;

  return jsonb_build_object(
    'status', v_status,
    'org_id', v_target,
    'org_name', (select name from public.organizations where id = v_target),
    'email', v_email
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Lists
-- ---------------------------------------------------------------------------

create function public.admin_list_companies()
returns table (
  org_id uuid, name text, type public.org_type, contact_email text,
  status text, invited_at timestamptz, invited_by_company text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
    select o.id, o.name, o.type, i.email,
           case when i.accepted_at is null then 'invited' else 'active' end,
           i.created_at, inv.name
    from public.organizations o
    left join lateral (
      select * from public.invitations x where x.org_id = o.id
      order by x.created_at limit 1
    ) i on true
    left join public.organizations inv on inv.id = i.invited_by_org_id
    order by o.created_at desc;
end;
$$;

-- Exporters linked to the caller's manufacturer.
create function public.my_exporters()
returns table (org_id uuid, name text, contact_email text, status text, linked_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select o.id, o.name, i.email,
         case when exists (select 1 from public.memberships m where m.org_id = o.id)
              then 'active' else 'invited' end,
         r.created_at
  from public.org_relationships r
  join public.organizations o on o.id = r.exporter_org_id
  left join lateral (
    select x.email from public.invitations x where x.org_id = o.id
    order by x.created_at limit 1
  ) i on true
  where r.manufacturer_org_id = public.current_org_id()
  order by r.created_at desc
$$;

-- Manufacturers linked to the caller's exporter.
create function public.my_manufacturers()
returns table (org_id uuid, name text, linked_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select o.id, o.name, r.created_at
  from public.org_relationships r
  join public.organizations o on o.id = r.manufacturer_org_id
  where r.exporter_org_id = public.current_org_id()
  order by o.name
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: signed-in users only
-- ---------------------------------------------------------------------------

revoke execute on function
  public.current_email(), public.is_platform_admin(), public.current_org_id(),
  public.my_account(), public.accept_invitation(),
  public.admin_invite_company(text, text, public.org_type), public.invite_exporter(text, text),
  public.admin_list_companies(), public.my_exporters(), public.my_manufacturers()
from public, anon;

grant execute on function
  public.current_email(), public.is_platform_admin(), public.current_org_id(),
  public.my_account(), public.accept_invitation(),
  public.admin_invite_company(text, text, public.org_type), public.invite_exporter(text, text),
  public.admin_list_companies(), public.my_exporters(), public.my_manufacturers()
to authenticated;
