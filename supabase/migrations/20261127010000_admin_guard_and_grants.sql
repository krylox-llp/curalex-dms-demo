-- 1. Admin emails can't be invited into a company (an admin's account should stay admin-only).
-- 2. Let the API roles call CuraLex functions instead of revoking them.
--    Every function already refuses callers it doesn't recognise (returns nothing or raises
--    'not_allowed'), so this doesn't widen access. It avoids Postgres' own "permission denied
--    for function" error, which crashes the database backend in some Supabase Postgres builds
--    (seen on supabase/postgres 17.12.0.000).

create or replace function public.admin_invite_company(p_name text, p_email text, p_type public.org_type)
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
  -- Platform admins manage CuraLex; they can't be invited into a company.
  if exists (select 1 from public.platform_admins where email = v_email) then
    raise exception 'admin_email' using errcode = '23514';
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

create or replace function public.invite_exporter(p_company text, p_email text)
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
  -- Platform admins manage CuraLex; they can't be invited into a company.
  if exists (select 1 from public.platform_admins where email = v_email) then
    raise exception 'admin_email' using errcode = '23514';
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

grant execute on function
  public.current_email(),
  public.is_platform_admin(),
  public.current_org_id(),
  public.my_account(),
  public.accept_invitation(),
  public.admin_invite_company(text, text, public.org_type),
  public.invite_exporter(text, text),
  public.admin_list_companies(),
  public.my_exporters(),
  public.my_manufacturers()
to anon, authenticated;
