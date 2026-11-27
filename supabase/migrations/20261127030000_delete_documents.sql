-- CuraLex: deleting folders, files and individual versions.
--
-- Deletes are "tombstones": rows get deleted_at, every live share of the affected versions is
-- revoked, and the functions return the storage paths so the app removes the files from Storage
-- (Supabase blocks deleting storage.objects rows from SQL). Keeping the rows preserves share
-- history for audits and means version numbers are never reused.

alter table public.folders           add column deleted_at timestamptz;
alter table public.documents         add column deleted_at timestamptz;
alter table public.document_versions add column deleted_at timestamptz;

-- Names only need to be unique among items that still exist.
drop index public.folders_unique_name;
create unique index folders_unique_name
  on public.folders (org_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
  where deleted_at is null;
drop index public.documents_unique_name;
create unique index documents_unique_name
  on public.documents (org_id, coalesce(folder_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
  where deleted_at is null;

-- Deleted items disappear from reads.
drop policy "read own folders" on public.folders;
create policy "read own folders" on public.folders for select to authenticated
  using (org_id = public.current_org_id() and deleted_at is null);

drop policy "read own documents" on public.documents;
create policy "read own documents" on public.documents for select to authenticated
  using (org_id = public.current_org_id() and deleted_at is null);

drop policy "read own document versions" on public.document_versions;
create policy "read own document versions" on public.document_versions for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.documents d
      where d.id = document_versions.document_id and d.org_id = public.current_org_id() and d.deleted_at is null
    )
  );

-- Existing functions now ignore deleted items.
create or replace function public.create_folder(p_parent uuid, p_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_org  uuid := public.current_manufacturer_org_id();
  v_name text := btrim(p_name);
  v_id   uuid;
begin
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

-- ---------------------------------------------------------------------------
-- Delete
-- ---------------------------------------------------------------------------


-- Tombstones versions owned by the caller's manufacturer, revokes their live shares and returns
-- their storage paths. It re-checks ownership itself (rather than relying on REVOKE, see the
-- 20261127010000 migration), so calling it directly can't touch another company's files.
create function public._delete_versions(p_version_ids uuid[]) returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids   uuid[];
  v_paths text[];
begin
  select array_agg(v.id) into v_ids
  from public.document_versions v join public.documents d on d.id = v.document_id
  where v.id = any (p_version_ids) and d.org_id = public.current_manufacturer_org_id();
  if v_ids is null then
    return '{}';
  end if;

  update public.document_shares
    set revoked_at = now()
    where version_id = any (v_ids) and revoked_at is null;
  update public.document_versions
    set deleted_at = now()
    where id = any (v_ids) and deleted_at is null;

  select coalesce(array_agg(storage_path), '{}') into v_paths
  from public.document_versions where id = any (v_ids);
  return v_paths;
end;
$$;

-- What a delete would affect, for the confirmation dialog. Pass exactly one kind of target.
create function public.delete_impact(p_document_ids uuid[], p_folder uuid, p_version uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_org     uuid := public.current_manufacturer_org_id();
  v_docs    uuid[];
  v_versions uuid[];
  v_folders int := 0;
begin
  if v_org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_version is not null then
    select array_agg(v.id) into v_versions
    from public.document_versions v join public.documents d on d.id = v.document_id
    where v.id = p_version and d.org_id = v_org and v.deleted_at is null and d.deleted_at is null;
  else
    if p_folder is not null then
      with recursive tree as (
        select id from public.folders where id = p_folder and org_id = v_org and deleted_at is null
        union all
        select f.id from public.folders f join tree t on f.parent_id = t.id where f.deleted_at is null
      )
      select array_agg(d.id), (select count(*) from tree)::int into v_docs, v_folders
      from tree left join public.documents d on d.folder_id = tree.id and d.deleted_at is null;
    else
      select array_agg(id) into v_docs from public.documents
      where id = any (p_document_ids) and org_id = v_org and deleted_at is null;
    end if;
    select array_agg(v.id) into v_versions from public.document_versions v
    where v.document_id = any (coalesce(v_docs, '{}')) and v.deleted_at is null;
  end if;

  return jsonb_build_object(
    'folders', v_folders,
    'files', coalesce(array_length(array_remove(v_docs, null), 1), 0),
    'versions', coalesce(array_length(v_versions, 1), 0),
    'live_shares', (
      select count(*) from public.document_shares s
      where s.version_id = any (coalesce(v_versions, '{}')) and s.revoked_at is null
        and (s.expires_at is null or s.expires_at > now())
    ),
    'exporters', (
      select count(distinct s.exporter_org_id) from public.document_shares s
      where s.version_id = any (coalesce(v_versions, '{}')) and s.revoked_at is null
        and (s.expires_at is null or s.expires_at > now())
    )
  );
end;
$$;

-- Deletes whole files (all versions).
create function public.delete_documents(p_document_ids uuid[]) returns text[]
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

-- Deletes one version. Deleting the only remaining version deletes the file.
create function public.delete_version(p_version uuid) returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid := public.current_manufacturer_org_id();
  v_doc uuid;
begin
  if v_org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
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

-- Deletes a folder with all its sub folders and files.
create function public.delete_folder(p_folder uuid) returns text[]
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

grant execute on function
  public._delete_versions(uuid[]), public.delete_impact(uuid[], uuid, uuid),
  public.delete_documents(uuid[]), public.delete_version(uuid), public.delete_folder(uuid)
to anon, authenticated;


-- Storage: manufacturers may remove files of versions they have deleted.
-- Checked through a definer function because deleted versions are hidden from normal reads.
create function public.can_remove_storage_object(p_name text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.document_versions v
    join public.documents d on d.id = v.document_id
    where v.storage_path = p_name
      and v.deleted_at is not null
      and d.org_id = public.current_manufacturer_org_id()
  )
$$;
grant execute on function public.can_remove_storage_object(text) to anon, authenticated;

create policy "manufacturers remove deleted versions"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.can_remove_storage_object(name));
