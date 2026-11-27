-- CuraLex: audit trail (21 CFR Part 11 §11.10(e), EU Annex 11 §9).
--
-- * audit_log is append-only: no client write policies, and triggers reject UPDATE/DELETE/TRUNCATE
--   for everyone (including the service role).
-- * Rows are written by AFTER triggers on every GxP table, so nothing that changes data can skip it.
-- * Each row stores a SHA-256 hash chained to the previous row; verify_audit_chain() checks it.
-- * The reason for a change travels with the request as the base64 header "x-audit-reason"
--   (PostgREST exposes request headers to SQL); critical functions require it.

create table public.audit_log (
  id                   bigint generated always as identity primary key,
  at                   timestamptz not null default clock_timestamp(),
  actor_user_id        uuid,
  actor_email          text,
  actor_org_id         uuid,
  org_id               uuid,          -- company that owns the record
  related_org_id       uuid,          -- other party (e.g. the exporter of a share)
  action               text not null, -- e.g. share.revoked
  table_name           text not null,
  operation            text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  record_id            text,
  subject_document_id  uuid,          -- groups events per document (versions, shares, access)
  subject_name         text,          -- snapshot of a human label (file, folder, company name)
  old_data             jsonb,
  new_data             jsonb,
  changed_fields       text[],
  reason               text,
  prev_hash            text,
  row_hash             text not null
);
create index audit_log_org_idx on public.audit_log (org_id, id desc);
create index audit_log_related_idx on public.audit_log (related_org_id, id desc);
create index audit_log_document_idx on public.audit_log (subject_document_id, id desc);

alter table public.audit_log enable row level security;
create policy "read audit of your company" on public.audit_log for select to authenticated
  using (
    public.is_platform_admin()
    or org_id = public.current_org_id()
    or related_org_id = public.current_org_id()
  );

create function public._audit_immutable() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end;
$$;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public._audit_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public._audit_immutable();

-- Reason sent with the current request (base64 header x-audit-reason), or null.
create function public._audit_reason() returns text
language plpgsql stable set search_path = ''
as $$
declare
  v text := nullif(current_setting('request.headers', true), '')::json ->> 'x-audit-reason';
begin
  if v is null or v = '' then
    return null;
  end if;
  return nullif(btrim(convert_from(decode(v, 'base64'), 'UTF8')), '');
exception when others then
  return null;
end;
$$;

create function public._require_reason() returns void
language plpgsql stable set search_path = ''
as $$
begin
  if public._audit_reason() is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;
end;
$$;

-- Appends one chained row. SECURITY DEFINER so it can insert despite RLS.
create function public._audit_append(
  p_action text, p_table text, p_op text, p_record_id text, p_org uuid, p_related uuid,
  p_document uuid, p_subject text, p_old jsonb, p_new jsonb
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_prev    text;
  v_at      timestamptz := clock_timestamp();
  v_uid     uuid := auth.uid();
  v_email   text := (select lower(email) from auth.users where id = auth.uid());
  v_actorg  uuid := (select org_id from public.memberships where user_id = auth.uid());
  v_reason  text := public._audit_reason();
  v_changed text[];
  v_hash    text;
begin
  -- Only callable from the audit triggers, never directly (e.g. via the API) to forge entries.
  if pg_trigger_depth() = 0 then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_old is not null and p_new is not null then
    select array_agg(k order by k) into v_changed
    from jsonb_object_keys(p_new) k
    where p_new -> k is distinct from p_old -> k;
  end if;

  -- Serialise appends so the chain has a single, well-defined order.
  perform pg_advisory_xact_lock(hashtext('curalex.audit_log'));
  select row_hash into v_prev from public.audit_log order by id desc limit 1;

  v_hash := encode(sha256(convert_to(concat_ws('|',
    coalesce(v_prev, ''), v_at::text, coalesce(v_uid::text, ''), coalesce(v_email, ''), p_action, p_table, p_op,
    coalesce(p_record_id, ''), coalesce(p_old::text, ''), coalesce(p_new::text, ''), coalesce(v_reason, '')
  ), 'UTF8')), 'hex');

  insert into public.audit_log
    (at, actor_user_id, actor_email, actor_org_id, org_id, related_org_id, action, table_name, operation, record_id,
     subject_document_id, subject_name, old_data, new_data, changed_fields, reason, prev_hash, row_hash)
  values
    (v_at, v_uid, v_email, v_actorg, p_org, p_related, p_action, p_table, p_op, p_record_id,
     p_document, p_subject, p_old, p_new, v_changed, v_reason, v_prev, v_hash);
end;
$$;
-- Granted (not revoked) to avoid the 'permission denied for function' crash path; guarded above.
grant execute on function public._audit_append(text, text, text, text, uuid, uuid, uuid, text, jsonb, jsonb) to anon, authenticated;

-- Recomputes every hash; returns the first broken id (or null when the chain is intact).
create function public.verify_audit_chain() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  r       record;
  v_prev  text;
  v_count bigint := 0;
begin
  if not public.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  for r in select * from public.audit_log order by id loop
    v_count := v_count + 1;
    if r.prev_hash is distinct from v_prev or r.row_hash <> encode(sha256(convert_to(concat_ws('|',
         coalesce(r.prev_hash, ''), r.at::text, coalesce(r.actor_user_id::text, ''), coalesce(r.actor_email, ''),
         r.action, r.table_name, r.operation, coalesce(r.record_id, ''), coalesce(r.old_data::text, ''),
         coalesce(r.new_data::text, ''), coalesce(r.reason, '')
       ), 'UTF8')), 'hex') then
      return jsonb_build_object('ok', false, 'checked', v_count, 'broken_at', r.id);
    end if;
    v_prev := r.row_hash;
  end loop;
  return jsonb_build_object('ok', true, 'checked', v_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- One trigger function for all audited tables: decides the action label, owner and subject.
-- ---------------------------------------------------------------------------
create function public._audit_trigger() returns trigger
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
    v_action := case tg_op when 'INSERT' then 'member.added' when 'DELETE' then 'member.removed' else 'member.updated' end;

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
    perform public._audit_append(v_action, tg_table_name, tg_op, coalesce(r ->> 'id', r ->> 'share_id', r ->> 'fpp_id'),
                                 v_org, v_related, v_doc, v_subject, o, n);
  end if;
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['folders', 'documents', 'document_versions', 'document_shares', 'access_events',
                           'org_relationships', 'invitations', 'memberships', 'organizations', 'platform_admins',
                           'fpps', 'fpp_manufacturers', 'fpp_documents'] loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public._audit_trigger()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Critical actions now require a reason (checked after the caller's permission).
-- ---------------------------------------------------------------------------
create or replace function public.delete_documents(p_document_ids uuid[]) returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_org  uuid := public.current_manufacturer_org_id();
  v_docs uuid[];
  v_versions uuid[];
begin
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

create or replace function public.revoke_shares(p_share_ids uuid[]) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_count int;
begin
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

create or replace function public.remove_exporter(p_exporter uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_org     uuid := public.current_manufacturer_org_id();
  v_revoked int;
begin
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

grant execute on function public.verify_audit_chain(), public._audit_reason(), public._require_reason() to anon, authenticated;
