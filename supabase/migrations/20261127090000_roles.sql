-- CuraLex: multi-user companies and roles (docs/roles-and-permissions.md, based on Revised Schedule M).
--
-- * member_roles: one or more roles per user; roles depend on the company type.
-- * has_permission(): the single permission check used by every write function.
-- * Users can be deactivated (history kept) instead of deleted.
-- * Existing users keep full access: they get every "founder" role for their company type.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

alter table public.memberships add column deactivated_at timestamptz;
alter table public.memberships add column deactivated_by uuid references auth.users (id) on delete set null;

create table public.member_roles (
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('admin', 'author', 'qa_approver', 'doc_controller', 'viewer', 'regulatory')),
  granted_by  uuid references auth.users (id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (user_id, role)
);
alter table public.member_roles enable row level security;
create policy "read roles in your company" on public.member_roles for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
      where m.user_id = member_roles.user_id and m.org_id = public.current_org_id()
    )
  );

-- Roles to grant when the invitation is accepted (null = founder roles for the company type).
alter table public.invitations add column roles text[];

-- ---------------------------------------------------------------------------
-- Role catalogue and permission map
-- ---------------------------------------------------------------------------

create function public._valid_roles(p_type public.org_type) returns text[]
language sql immutable set search_path = ''
as $$
  select case p_type
    when 'manufacturer' then array['admin', 'author', 'qa_approver', 'doc_controller', 'viewer']
    else array['admin', 'regulatory', 'viewer'] end
$$;

-- Roles given to a company's first contact (and to users who existed before roles).
create function public._founder_roles(p_type public.org_type) returns text[]
language sql immutable set search_path = ''
as $$
  select case p_type
    when 'manufacturer' then array['admin', 'author', 'qa_approver', 'doc_controller']
    else array['admin', 'regulatory'] end
$$;

-- Which roles grant a permission. Mirrors the matrices in docs/roles-and-permissions.md.
create function public._roles_for(p_type public.org_type, p_perm text) returns text[]
language sql immutable set search_path = ''
as $$
  select case p_type
    when 'manufacturer' then case p_perm
      when 'documents.edit'   then array['author']
      when 'documents.delete' then array['qa_approver']
      when 'sharing.share'    then array['doc_controller']
      when 'sharing.revoke'   then array['admin', 'qa_approver', 'doc_controller']
      when 'exporters.invite' then array['admin', 'doc_controller']
      when 'exporters.remove' then array['admin']
      when 'activity.view'    then array['admin', 'qa_approver', 'doc_controller', 'viewer']
      when 'audit.view'       then array['admin', 'qa_approver', 'doc_controller', 'viewer']
      when 'users.manage'     then array['admin']
      else array[]::text[] end
    else case p_perm
      when 'products.edit'      then array['admin', 'regulatory']
      when 'documents.download' then array['admin', 'regulatory']
      when 'audit.view'         then array['admin', 'regulatory']
      when 'users.manage'       then array['admin']
      else array[]::text[] end
  end
$$;

-- ---------------------------------------------------------------------------
-- Current user: ignore deactivated memberships everywhere
-- ---------------------------------------------------------------------------

create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.org_id from public.memberships m where m.user_id = auth.uid() and m.deactivated_at is null
$$;

create or replace function public.current_manufacturer_org_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select o.id from public.memberships m join public.organizations o on o.id = m.org_id
  where m.user_id = auth.uid() and m.deactivated_at is null and o.type = 'manufacturer'
$$;

create or replace function public.current_exporter_org_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select o.id from public.memberships m join public.organizations o on o.id = m.org_id
  where m.user_id = auth.uid() and m.deactivated_at is null and o.type = 'exporter'
$$;

create function public.my_roles() returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(mr.role order by mr.role), array[]::text[])
  from public.member_roles mr
  join public.memberships m on m.user_id = mr.user_id and m.deactivated_at is null
  where mr.user_id = auth.uid()
$$;

create function public.has_permission(p_perm text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id = m.org_id
    join public.member_roles mr on mr.user_id = m.user_id
    where m.user_id = auth.uid() and m.deactivated_at is null
      and mr.role = any (public._roles_for(o.type, p_perm))
  )
$$;

create function public._require_permission(p_perm text) returns void
language plpgsql stable set search_path = ''
as $$
begin
  if not public.has_permission(p_perm) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.my_account() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'email', public.current_email(),
    'is_admin', public.is_platform_admin(),
    'org', (
      select jsonb_build_object('id', o.id, 'name', o.name, 'type', o.type)
      from public.memberships m join public.organizations o on o.id = m.org_id
      where m.user_id = auth.uid() and m.deactivated_at is null
    ),
    'roles', to_jsonb(public.my_roles()),
    'permissions', to_jsonb(coalesce((
      select array_agg(p order by p) from unnest(array[
        'documents.edit', 'documents.delete', 'sharing.share', 'sharing.revoke', 'exporters.invite', 'exporters.remove',
        'activity.view', 'audit.view', 'users.manage', 'products.edit', 'documents.download'
      ]) p where public.has_permission(p)
    ), array[]::text[])),
    'deactivated', exists (select 1 from public.memberships where user_id = auth.uid() and deactivated_at is not null)
  )
$$;

-- ---------------------------------------------------------------------------
-- Backfill: existing users get founder roles; pending invitations get founder roles
-- ---------------------------------------------------------------------------

insert into public.member_roles (user_id, role)
select m.user_id, unnest(public._founder_roles(o.type))
from public.memberships m join public.organizations o on o.id = m.org_id
on conflict do nothing;

update public.invitations i set roles = public._founder_roles(o.type)
from public.organizations o where o.id = i.org_id and i.roles is null;

-- New invitations without explicit roles (company contacts) get founder roles.
create function public._invitation_default_roles() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.roles is null then
    new.roles := public._founder_roles((select type from public.organizations where id = new.org_id));
  end if;
  return new;
end;
$$;
create trigger invitations_default_roles before insert on public.invitations
  for each row execute function public._invitation_default_roles();

-- Accepting an invitation also grants its roles.
create or replace function public.accept_invitation() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_email  text := public.current_email();
  v_invite public.invitations;
  v_type   public.org_type;
begin
  if auth.uid() is null or v_email is null then
    return public.my_account();
  end if;
  if exists (select 1 from public.memberships where user_id = auth.uid()) then
    return public.my_account();
  end if;

  select * into v_invite from public.invitations where email = v_email and accepted_at is null for update;
  if found then
    select type into v_type from public.organizations where id = v_invite.org_id;
    insert into public.memberships (user_id, org_id) values (auth.uid(), v_invite.org_id);
    insert into public.member_roles (user_id, role, granted_by)
      select auth.uid(), r, v_invite.invited_by
      from unnest(coalesce(v_invite.roles, public._founder_roles(v_type))) r
      where r = any (public._valid_roles(v_type))
      on conflict do nothing;
    update public.invitations set accepted_at = now(), accepted_by = auth.uid() where id = v_invite.id;
  end if;
  return public.my_account();
end;
$$;

-- ---------------------------------------------------------------------------
-- Team management (company admins)
-- ---------------------------------------------------------------------------

create function public._clean_roles(p_roles text[], p_type public.org_type) returns text[]
language plpgsql immutable set search_path = ''
as $$
declare
  v text[];
begin
  select array_agg(distinct r order by r) into v from unnest(p_roles) r where r is not null;
  if v is null or array_length(v, 1) is null then
    raise exception 'roles_required' using errcode = '22023';
  end if;
  if not v <@ public._valid_roles(p_type) then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  return v;
end;
$$;

create function public._assert_admin_remains(p_org uuid) returns void
language plpgsql stable set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.memberships m join public.member_roles mr on mr.user_id = m.user_id and mr.role = 'admin'
    where m.org_id = p_org and m.deactivated_at is null
  ) then
    raise exception 'last_admin' using errcode = '23514';
  end if;
end;
$$;

-- Invite a colleague into the caller's company with the given roles.
create function public.invite_colleague(p_email text, p_roles text[]) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_org   uuid := public.current_org_id();
  v_type  public.org_type;
  v_email text := lower(btrim(p_email));
  v_roles text[];
begin
  perform public._require_permission('users.manage');
  select type into v_type from public.organizations where id = v_org;
  v_roles := public._clean_roles(p_roles, v_type);
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if exists (select 1 from public.platform_admins where email = v_email) then
    raise exception 'admin_email' using errcode = '23514';
  end if;
  if exists (select 1 from public.memberships m join auth.users u on u.id = m.user_id where lower(u.email) = v_email) then
    raise exception 'already_member' using errcode = '23505';
  end if;
  if exists (select 1 from public.invitations where email = v_email and accepted_at is null) then
    raise exception 'already_invited' using errcode = '23505';
  end if;

  insert into public.invitations (org_id, email, invited_by, roles) values (v_org, v_email, auth.uid(), v_roles);
  return jsonb_build_object('email', v_email, 'roles', to_jsonb(v_roles), 'org_type', v_type);
end;
$$;

create function public.set_member_roles(p_user uuid, p_roles text[]) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_org   uuid := public.current_org_id();
  v_type  public.org_type;
  v_roles text[];
begin
  perform public._require_permission('users.manage');
  if not exists (select 1 from public.memberships where user_id = p_user and org_id = v_org) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select type into v_type from public.organizations where id = v_org;
  v_roles := public._clean_roles(p_roles, v_type);

  delete from public.member_roles where user_id = p_user and not (role = any (v_roles));
  insert into public.member_roles (user_id, role, granted_by)
    select p_user, r, auth.uid() from unnest(v_roles) r
    on conflict do nothing;
  perform public._assert_admin_remains(v_org);
end;
$$;

create function public.set_member_active(p_user uuid, p_active boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid := public.current_org_id();
begin
  perform public._require_permission('users.manage');
  if p_user = auth.uid() then
    raise exception 'cannot_change_self' using errcode = '22023';
  end if;
  update public.memberships
    set deactivated_at = case when p_active then null else now() end,
        deactivated_by = case when p_active then null else auth.uid() end
    where user_id = p_user and org_id = v_org
      and (deactivated_at is null) = (not p_active);
  if not found and not exists (select 1 from public.memberships where user_id = p_user and org_id = v_org) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public._assert_admin_remains(v_org);
end;
$$;

create function public.cancel_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public._require_permission('users.manage');
  delete from public.invitations
    where id = p_invitation and org_id = public.current_org_id() and accepted_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Members and pending invitations of the caller's company.
create function public.my_team() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_org uuid := public.current_org_id();
begin
  perform public._require_permission('users.manage');
  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'email', lower(u.email),
        'name', u.raw_user_meta_data ->> 'full_name',
        'roles', coalesce((select jsonb_agg(role order by role) from public.member_roles where user_id = m.user_id), '[]'::jsonb),
        'active', m.deactivated_at is null,
        'joined_at', m.created_at,
        'last_sign_in_at', u.last_sign_in_at,
        'is_me', m.user_id = auth.uid()
      ) order by lower(u.email))
      from public.memberships m join auth.users u on u.id = m.user_id
      where m.org_id = v_org
    ), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'roles', to_jsonb(i.roles), 'invited_at', i.created_at)
             order by i.created_at desc)
      from public.invitations i where i.org_id = v_org and i.accepted_at is null
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit: role changes, deactivation; audit trail readable only with audit.view
-- ---------------------------------------------------------------------------

create or replace function public._audit_trigger() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  v_action  text;
  v_org     uuid;
  v_related uuid;
  v_doc     uuid;
  v_subject text;
begin
  case tg_table_name
  when 'folders' then
    v_org := (r ->> 'org_id')::uuid;
    v_subject := r ->> 'name';
    v_action := case
      when tg_op = 'INSERT' then 'folder.created'
      when o ->> 'deleted_at' is null and n ->> 'deleted_at' is not null then 'folder.deleted'
      when o ->> 'name' is distinct from n ->> 'name' then 'folder.renamed'
      else 'folder.updated' end;

  when 'documents' then
    v_org := (r ->> 'org_id')::uuid;
    v_doc := (r ->> 'id')::uuid;
    v_subject := r ->> 'name';
    v_action := case
      when tg_op = 'INSERT' then 'document.created'
      when o ->> 'deleted_at' is null and n ->> 'deleted_at' is not null then 'document.deleted'
      when o ->> 'name' is distinct from n ->> 'name' then 'document.renamed'
      else 'document.updated' end;

  when 'document_versions' then
    v_doc := (r ->> 'document_id')::uuid;
    select d.org_id, d.name || ' v' || (r ->> 'version') into v_org, v_subject from public.documents d where d.id = v_doc;
    v_action := case
      when tg_op = 'INSERT' then null  -- pending reservation; logged once the upload completes
      when o ->> 'status' = 'pending' and n ->> 'status' = 'ready' then 'version.uploaded'
      when o ->> 'deleted_at' is null and n ->> 'deleted_at' is not null then 'version.deleted'
      when o ->> 'storage_path' is distinct from n ->> 'storage_path' then 'version.moved'
      else 'version.updated' end;

  when 'document_shares' then
    v_org := (r ->> 'manufacturer_org_id')::uuid;
    v_related := (r ->> 'exporter_org_id')::uuid;
    select v.document_id, d.name || ' v' || v.version || ' → ' || coalesce(e.name, '?')
      into v_doc, v_subject
    from public.document_versions v join public.documents d on d.id = v.document_id
    left join public.organizations e on e.id = v_related
    where v.id = (r ->> 'version_id')::uuid;
    v_action := case
      when tg_op = 'INSERT' then 'share.created'
      when o ->> 'revoked_at' is null and n ->> 'revoked_at' is not null then 'share.revoked'
      when o ->> 'expires_at' is distinct from n ->> 'expires_at' then 'share.duration_changed'
      else 'share.updated' end;

  when 'access_events' then
    v_org := (r ->> 'manufacturer_org_id')::uuid;
    v_related := (r ->> 'exporter_org_id')::uuid;
    select v.document_id, d.name || ' v' || v.version into v_doc, v_subject
    from public.document_versions v join public.documents d on d.id = v.document_id
    where v.id = (r ->> 'version_id')::uuid;
    v_action := 'document.' || case when r ->> 'action' = 'download' then 'downloaded' else 'viewed' end;

  when 'org_relationships' then
    v_org := (r ->> 'manufacturer_org_id')::uuid;
    v_related := (r ->> 'exporter_org_id')::uuid;
    v_subject := (select name from public.organizations where id = v_related);
    v_action := case tg_op when 'INSERT' then 'exporter.connected' when 'DELETE' then 'exporter.removed' else 'exporter.updated' end;

  when 'invitations' then
    v_org := (r ->> 'org_id')::uuid;
    v_related := (r ->> 'invited_by_org_id')::uuid;
    v_subject := r ->> 'email';
    v_action := case
      when tg_op = 'INSERT' then 'invitation.created'
      when o ->> 'accepted_at' is null and n ->> 'accepted_at' is not null then 'invitation.accepted'
      when tg_op = 'DELETE' then 'invitation.deleted'
      else 'invitation.updated' end;

  when 'memberships' then
    v_org := (r ->> 'org_id')::uuid;
    v_subject := (select lower(email) from auth.users where id = (r ->> 'user_id')::uuid);
    v_action := case
      when tg_op = 'INSERT' then 'member.added'
      when tg_op = 'DELETE' then 'member.removed'
      when o ->> 'deactivated_at' is null and n ->> 'deactivated_at' is not null then 'member.deactivated'
      when o ->> 'deactivated_at' is not null and n ->> 'deactivated_at' is null then 'member.reactivated'
      else 'member.updated' end;

  when 'member_roles' then
    v_org := (select org_id from public.memberships where user_id = (r ->> 'user_id')::uuid);
    v_subject := (select lower(email) from auth.users where id = (r ->> 'user_id')::uuid) || ': ' || (r ->> 'role');
    v_action := case tg_op when 'INSERT' then 'member.role_added' when 'DELETE' then 'member.role_removed' else 'member.updated' end;

  when 'organizations' then
    v_org := (r ->> 'id')::uuid;
    v_subject := r ->> 'name';
    v_action := case tg_op when 'INSERT' then 'company.created' when 'DELETE' then 'company.deleted' else 'company.updated' end;

  when 'platform_admins' then
    v_subject := r ->> 'email';
    v_action := case tg_op when 'INSERT' then 'admin.added' when 'DELETE' then 'admin.removed' else 'admin.updated' end;

  when 'fpps' then
    v_org := (r ->> 'exporter_org_id')::uuid;
    v_subject := r ->> 'name';
    v_action := case tg_op when 'INSERT' then 'product.created' when 'DELETE' then 'product.deleted' else 'product.updated' end;

  when 'fpp_manufacturers' then
    select f.exporter_org_id, f.name || ' ← ' || coalesce(m.name, '?') into v_org, v_subject
    from public.fpps f left join public.organizations m on m.id = (r ->> 'manufacturer_org_id')::uuid
    where f.id = (r ->> 'fpp_id')::uuid;
    v_action := case tg_op when 'INSERT' then 'product.manufacturer_added' when 'DELETE' then 'product.manufacturer_removed'
                else 'product.manufacturer_role_changed' end;

  when 'fpp_documents' then
    select f.exporter_org_id, f.name into v_org, v_subject from public.fpps f where f.id = (r ->> 'fpp_id')::uuid;
    select v.document_id into v_doc from public.document_shares s join public.document_versions v on v.id = s.version_id
    where s.id = (r ->> 'share_id')::uuid;
    v_action := case tg_op when 'INSERT' then 'product.document_added' else 'product.document_removed' end;
  end case;

  if v_action is not null then
    perform public._audit_append(v_action, tg_table_name, tg_op, coalesce(r ->> 'id', r ->> 'share_id', r ->> 'fpp_id', r ->> 'user_id'),
                                 v_org, v_related, v_doc, v_subject, o, n);
  end if;
  return null;
end;
$$;

create trigger audit_member_roles after insert or update or delete on public.member_roles
  for each row execute function public._audit_trigger();

drop policy "read audit of your company" on public.audit_log;
create policy "read audit of your company" on public.audit_log for select to authenticated
  using (
    public.is_platform_admin()
    or ((org_id = public.current_org_id() or related_org_id = public.current_org_id()) and public.has_permission('audit.view'))
  );

-- ---------------------------------------------------------------------------
-- Every write function now checks the permission its action needs
-- ---------------------------------------------------------------------------

create or replace function public.create_folder(p_parent uuid, p_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_org  uuid := public.current_manufacturer_org_id();
  v_name text := btrim(p_name);
  v_id   uuid;
begin
  perform public._require_permission('documents.edit');
  if v_org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_name = '' or length(v_name) > 100 or v_name ~ '[/\\]' or v_name in ('.', '..') then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if p_parent is not null and not exists (
    select 1 from public.folders where id = p_parent and org_id = v_org and deleted_at is null
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.folders (org_id, parent_id, name, created_by)
    values (v_org, p_parent, v_name, auth.uid())
    returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'folder_exists' using errcode = '23505';
end;
$$;

create or replace function public.reserve_upload(p_folder uuid, p_file_name text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_org      uuid := public.current_manufacturer_org_id();
  v_name     text := btrim(p_file_name);
  v_doc      uuid;
  v_doc_name text;
  v_version  int;
  v_ext      text;
  v_path     text;
  v_folder_path text;
  v_vid      uuid;
begin
  perform public._require_permission('documents.edit');
  if v_org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_name = '' or length(v_name) > 200 or v_name ~ '[/\\]' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if p_folder is not null and not exists (
    select 1 from public.folders where id = p_folder and org_id = v_org and deleted_at is null
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select id, name into v_doc, v_doc_name from public.documents
  where org_id = v_org
    and coalesce(folder_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(p_folder, '00000000-0000-0000-0000-000000000000'::uuid)
    and lower(name) = lower(v_name)
    and deleted_at is null
  for update;

  if v_doc is null then
    insert into public.documents (org_id, folder_id, name, created_by)
      values (v_org, p_folder, v_name, auth.uid())
      returning id, name into v_doc, v_doc_name;
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.document_versions where document_id = v_doc;

  -- Path uses the document's stored name so every version sits in the same storage folder.
  v_ext := coalesce(substring(v_doc_name from '(\.[A-Za-z0-9]{1,10})$'), '');
  v_folder_path := (
    select string_agg(public.storage_safe(seg), '/')
    from unnest(string_to_array(public.folder_path(p_folder), '/')) as seg
    where seg <> ''
  );
  v_path := v_org::text
    || coalesce('/' || v_folder_path, '')
    || '/' || public.storage_safe(v_doc_name)
    || '/v' || v_version || lower(v_ext);

  -- A deleted file may have used this exact path; keep paths unique with a short suffix.
  v_vid := gen_random_uuid();
  if exists (select 1 from public.document_versions where storage_path = v_path) then
    v_path := regexp_replace(v_path, '(\.[a-z0-9]{1,10})?$', '-' || left(v_vid::text, 8) || '\1');
  end if;

  insert into public.document_versions (id, document_id, version, storage_path, uploaded_by)
    values (v_vid, v_doc, v_version, v_path, auth.uid());

  return jsonb_build_object(
    'document_id', v_doc, 'version_id', v_vid, 'version', v_version, 'storage_path', v_path
  );
end;
$$;

create or replace function public.complete_upload(p_version uuid, p_size bigint, p_mime text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid := public.current_manufacturer_org_id();
  v_row public.document_versions;
begin
  perform public._require_permission('documents.edit');
  select v.* into v_row
  from public.document_versions v
  join public.documents d on d.id = v.document_id
  where v.id = p_version and d.org_id = v_org and v.status = 'pending'
    and v.deleted_at is null and d.deleted_at is null
  for update of v;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from storage.objects where bucket_id = 'documents' and name = v_row.storage_path
  ) then
    raise exception 'file_missing' using errcode = 'P0002';
  end if;

  update public.document_versions
    set status = 'ready', size_bytes = p_size, mime_type = left(p_mime, 200)
    where id = p_version;

  return jsonb_build_object('version_id', p_version, 'version', v_row.version);
end;
$$;

create or replace function public.delete_documents(p_document_ids uuid[]) returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_org  uuid := public.current_manufacturer_org_id();
  v_docs uuid[];
  v_versions uuid[];
begin
  perform public._require_permission('documents.delete');
  if v_org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform public._require_reason();
  select array_agg(id) into v_docs from public.documents
  where id = any (p_document_ids) and org_id = v_org and deleted_at is null;
  if v_docs is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(id), '{}') into v_versions from public.document_versions
  where document_id = any (v_docs) and deleted_at is null;
  update public.documents set deleted_at = now() where id = any (v_docs);
  return public._delete_versions(v_versions);
end;
$$;

create or replace function public.delete_version(p_version uuid) returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid := public.current_manufacturer_org_id();
  v_doc uuid;
begin
  perform public._require_permission('documents.delete');
  if v_org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform public._require_reason();
  select v.document_id into v_doc
  from public.document_versions v join public.documents d on d.id = v.document_id
  where v.id = p_version and d.org_id = v_org and v.deleted_at is null and d.deleted_at is null;
  if v_doc is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.document_versions
    where document_id = v_doc and id <> p_version and deleted_at is null and status = 'ready'
  ) then
    return public.delete_documents(array[v_doc]);
  end if;
  return public._delete_versions(array[p_version]);
end;
$$;

create or replace function public.delete_folder(p_folder uuid) returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_org     uuid := public.current_manufacturer_org_id();
  v_folders uuid[];
  v_docs    uuid[];
  v_versions uuid[];
begin
  perform public._require_permission('documents.delete');
  if v_org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform public._require_reason();
  with recursive tree as (
    select id from public.folders where id = p_folder and org_id = v_org and deleted_at is null
    union all
    select f.id from public.folders f join tree t on f.parent_id = t.id where f.deleted_at is null
  )
  select array_agg(id) into v_folders from tree;
  if v_folders is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(id), '{}') into v_docs from public.documents
  where folder_id = any (v_folders) and deleted_at is null;
  select coalesce(array_agg(id), '{}') into v_versions from public.document_versions
  where document_id = any (v_docs) and deleted_at is null;

  update public.documents set deleted_at = now() where id = any (v_docs);
  update public.folders set deleted_at = now() where id = any (v_folders);
  return public._delete_versions(v_versions);
end;
$$;

create or replace function public.share_versions(p_exporter uuid, p_items jsonb) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_org   uuid := public.current_manufacturer_org_id();
  v_item  jsonb;
  v_vid   uuid;
  v_days  int;
  v_exp   timestamptz;
  v_count int := 0;
begin
  perform public._require_permission('sharing.share');
  if v_org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.org_relationships
    where manufacturer_org_id = v_org and exporter_org_id = p_exporter
  ) then
    raise exception 'not_your_exporter' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'nothing_selected' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_vid := (v_item ->> 'version_id')::uuid;
    v_days := nullif(v_item ->> 'days', '')::int;
    if v_days is not null and (v_days < 1 or v_days > 3650) then
      raise exception 'invalid_duration' using errcode = '22023';
    end if;
    v_exp := case when v_days is null then null else now() + make_interval(days => v_days) end;

    if not exists (
      select 1 from public.document_versions v join public.documents d on d.id = v.document_id
      where v.id = v_vid and v.status = 'ready' and d.org_id = v_org
        and v.deleted_at is null and d.deleted_at is null
    ) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;

    update public.document_shares
      set expires_at = v_exp
      where version_id = v_vid and exporter_org_id = p_exporter and revoked_at is null;
    if not found then
      insert into public.document_shares (version_id, manufacturer_org_id, exporter_org_id, expires_at, created_by)
        values (v_vid, v_org, p_exporter, v_exp, auth.uid());
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.set_share_duration(p_share uuid, p_days int) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public._require_permission('sharing.share');
  if p_days is not null and (p_days < 1 or p_days > 3650) then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;
  update public.document_shares
    set expires_at = case when p_days is null then null else now() + make_interval(days => p_days) end
    where id = p_share
      and manufacturer_org_id = public.current_manufacturer_org_id()
      and revoked_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.revoke_shares(p_share_ids uuid[]) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_count int;
begin
  perform public._require_permission('sharing.revoke');
  if public.current_manufacturer_org_id() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform public._require_reason();
  update public.document_shares
    set revoked_at = now()
    where id = any (p_share_ids)
      and manufacturer_org_id = public.current_manufacturer_org_id()
      and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
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
  perform public._require_permission('exporters.invite');
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

create or replace function public.remove_exporter(p_exporter uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_org     uuid := public.current_manufacturer_org_id();
  v_revoked int;
begin
  perform public._require_permission('exporters.remove');
  if v_org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform public._require_reason();
  if not exists (
    select 1 from public.org_relationships where manufacturer_org_id = v_org and exporter_org_id = p_exporter
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  update public.document_shares
    set revoked_at = now()
    where manufacturer_org_id = v_org and exporter_org_id = p_exporter and revoked_at is null;
  get diagnostics v_revoked = row_count;

  -- This manufacturer's documents and entry in the exporter's FPPs.
  delete from public.fpp_documents fd
    using public.document_shares s, public.fpps f
    where fd.share_id = s.id and fd.fpp_id = f.id
      and s.manufacturer_org_id = v_org and f.exporter_org_id = p_exporter;
  delete from public.fpp_manufacturers fm
    using public.fpps f
    where fm.fpp_id = f.id and fm.manufacturer_org_id = v_org and f.exporter_org_id = p_exporter;

  delete from public.org_relationships where manufacturer_org_id = v_org and exporter_org_id = p_exporter;
  return v_revoked;
end;
$$;

create or replace function public.create_fpp(p_name text, p_details text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid := public.current_exporter_org_id();
  v_id  uuid;
begin
  perform public._require_permission('products.edit');
  if v_org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  insert into public.fpps (exporter_org_id, name, details, created_by)
    values (v_org, btrim(p_name), nullif(btrim(coalesce(p_details, '')), ''), auth.uid())
    returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'fpp_exists' using errcode = '23505';
end;
$$;

create or replace function public.update_fpp(p_fpp uuid, p_name text, p_details text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public._require_permission('products.edit');
  perform public._own_fpp(p_fpp);
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  update public.fpps set name = btrim(p_name), details = nullif(btrim(coalesce(p_details, '')), '') where id = p_fpp;
exception when unique_violation then
  raise exception 'fpp_exists' using errcode = '23505';
end;
$$;

create or replace function public.delete_fpp(p_fpp uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public._require_permission('products.edit');
  perform public._own_fpp(p_fpp);
  delete from public.fpps where id = p_fpp;
end;
$$;

create or replace function public.add_fpp_manufacturer(p_fpp uuid, p_manufacturer uuid, p_role text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public._require_permission('products.edit');
  perform public._own_fpp(p_fpp);
  if not exists (
    select 1 from public.org_relationships
    where exporter_org_id = public.current_exporter_org_id() and manufacturer_org_id = p_manufacturer
  ) then
    raise exception 'not_your_manufacturer' using errcode = '42501';
  end if;
  insert into public.fpp_manufacturers (fpp_id, manufacturer_org_id, role)
    values (p_fpp, p_manufacturer, nullif(p_role, ''))
    on conflict (fpp_id, manufacturer_org_id) do update set role = excluded.role;
end;
$$;

create or replace function public.remove_fpp_manufacturer(p_fpp uuid, p_manufacturer uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public._require_permission('products.edit');
  perform public._own_fpp(p_fpp);
  delete from public.fpp_documents fd
    using public.document_shares s
    where fd.fpp_id = p_fpp and s.id = fd.share_id and s.manufacturer_org_id = p_manufacturer;
  delete from public.fpp_manufacturers where fpp_id = p_fpp and manufacturer_org_id = p_manufacturer;
end;
$$;

create or replace function public.add_fpp_documents(p_fpp uuid, p_share_ids uuid[]) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_count int;
begin
  perform public._require_permission('products.edit');
  perform public._own_fpp(p_fpp);
  if exists (
    select 1 from unnest(p_share_ids) as x(id)
    where not exists (
      select 1 from public.document_shares s
      join public.fpp_manufacturers fm on fm.fpp_id = p_fpp and fm.manufacturer_org_id = s.manufacturer_org_id
      where s.id = x.id and s.exporter_org_id = public.current_exporter_org_id() and s.revoked_at is null
    )
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.fpp_documents (fpp_id, share_id)
    select p_fpp, id from unnest(p_share_ids) as x(id)
    on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.remove_fpp_document(p_fpp uuid, p_share uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public._require_permission('products.edit');
  perform public._own_fpp(p_fpp);
  delete from public.fpp_documents where fpp_id = p_fpp and share_id = p_share;
end;
$$;

create or replace function public.record_document_access(p_share uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_exporter uuid := public.current_exporter_org_id();
  v_row record;
begin
  if p_action = 'download' then
    perform public._require_permission('documents.download');
  end if;
  if p_action not in ('view', 'download') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;

  select s.id, s.version_id, s.manufacturer_org_id, s.exporter_org_id, v.storage_path, v.mime_type, d.name
    into v_row
  from public.document_shares s
  join public.document_versions v on v.id = s.version_id and v.deleted_at is null and v.status = 'ready'
  join public.documents d on d.id = v.document_id and d.deleted_at is null
  where s.id = p_share
    and s.exporter_org_id = v_exporter
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > now());

  if not found then
    raise exception 'no_access' using errcode = '42501';
  end if;

  insert into public.access_events
    (share_id, version_id, manufacturer_org_id, exporter_org_id, user_id, user_email, action)
  values
    (v_row.id, v_row.version_id, v_row.manufacturer_org_id, v_row.exporter_org_id,
     auth.uid(), public.current_email(), p_action);

  return jsonb_build_object('storage_path', v_row.storage_path, 'file_name', v_row.name, 'mime_type', v_row.mime_type);
end;
$$;

grant execute on function
  public._valid_roles(public.org_type), public._founder_roles(public.org_type), public._roles_for(public.org_type, text),
  public.my_roles(), public.has_permission(text), public._require_permission(text),
  public._clean_roles(text[], public.org_type), public._assert_admin_remains(uuid),
  public.invite_colleague(text, text[]), public.set_member_roles(uuid, text[]), public.set_member_active(uuid, boolean),
  public.cancel_invitation(uuid), public.my_team()
to anon, authenticated;
