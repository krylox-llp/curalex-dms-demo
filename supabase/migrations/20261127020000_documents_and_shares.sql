-- CuraLex: manufacturer document library (folders, files, versions) and sharing with exporters.
--
-- Storage layout (private bucket "documents"), mirroring the folder tree:
--   <org_id>/<Folder>/<Sub folder>/<File name>/v<N><.ext>
-- Path segments are made storage-safe; the database keeps the real display names.
--
-- Upload flow (client uploads straight to Storage, no large bodies through the app server):
--   1. reserve_upload()   -> creates the document (if new) and a pending version, returns its path
--   2. client uploads the file to that exact path (storage RLS only allows pending paths of your org)
--   3. complete_upload()  -> checks the object exists and marks the version ready
--
-- As in earlier migrations: clients only READ through RLS; writes go through SECURITY DEFINER
-- functions, which are granted to anon/authenticated and check the caller themselves.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.folders (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  parent_id   uuid references public.folders (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 100 and name !~ '[/\\]'),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
-- Folder names are unique (case-insensitive) within their parent; root folders have parent null.
create unique index folders_unique_name
  on public.folders (org_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  folder_id   uuid references public.folders (id) on delete cascade, -- null = top level
  name        text not null check (length(btrim(name)) between 1 and 200 and name !~ '[/\\]'),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index documents_unique_name
  on public.documents (org_id, coalesce(folder_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table public.document_versions (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents (id) on delete cascade,
  version       int not null check (version > 0),
  storage_path  text not null unique,
  status        text not null default 'pending' check (status in ('pending', 'ready')),
  size_bytes    bigint,
  mime_type     text,
  uploaded_by   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (document_id, version)
);

create table public.document_shares (
  id                   uuid primary key default gen_random_uuid(),
  version_id           uuid not null references public.document_versions (id) on delete cascade,
  manufacturer_org_id  uuid not null references public.organizations (id) on delete cascade,
  exporter_org_id      uuid not null references public.organizations (id) on delete cascade,
  expires_at           timestamptz,          -- null = no expiry
  revoked_at           timestamptz,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now()
);
-- At most one live (not revoked) share of a version per exporter.
create unique index document_shares_one_live
  on public.document_shares (version_id, exporter_org_id) where revoked_at is null;
create index document_shares_manufacturer_idx on public.document_shares (manufacturer_org_id);
create index document_shares_exporter_idx on public.document_shares (exporter_org_id);

-- ---------------------------------------------------------------------------
-- Row level security (read-only)
-- ---------------------------------------------------------------------------

alter table public.folders           enable row level security;
alter table public.documents         enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_shares   enable row level security;

create policy "read own folders" on public.folders for select to authenticated
  using (org_id = public.current_org_id());

create policy "read own documents" on public.documents for select to authenticated
  using (org_id = public.current_org_id());

create policy "read own document versions" on public.document_versions for select to authenticated
  using (exists (
    select 1 from public.documents d
    where d.id = document_versions.document_id and d.org_id = public.current_org_id()
  ));

create policy "read shares you gave or received" on public.document_shares for select to authenticated
  using (manufacturer_org_id = public.current_org_id() or exporter_org_id = public.current_org_id());

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The caller's org id, but only if it is a manufacturer.
create function public.current_manufacturer_org_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select o.id from public.memberships m
  join public.organizations o on o.id = m.org_id
  where m.user_id = auth.uid() and o.type = 'manufacturer'
$$;

-- Replaces characters Supabase Storage keys don't allow.
create function public.storage_safe(p text) returns text
language sql immutable set search_path = ''
as $$
  select regexp_replace(btrim(p), '[^A-Za-z0-9 _.,()&+@=;:!$''-]', '_', 'g')
$$;

-- "Quality/CoA" style path of a folder (display names), or '' for the top level.
create function public.folder_path(p_folder uuid) returns text
language sql stable security definer set search_path = ''
as $$
  with recursive chain as (
    select id, parent_id, name, 0 as depth from public.folders where id = p_folder
    union all
    select f.id, f.parent_id, f.name, c.depth + 1
    from public.folders f join chain c on f.id = c.parent_id
  )
  select coalesce(string_agg(name, '/' order by depth desc), '') from chain
$$;

-- ---------------------------------------------------------------------------
-- Folders and uploads
-- ---------------------------------------------------------------------------

create function public.create_folder(p_parent uuid, p_name text) returns uuid
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
    select 1 from public.folders where id = p_parent and org_id = v_org
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

-- Starts an upload into a folder. A file name that already exists in the folder becomes its next version.
create function public.reserve_upload(p_folder uuid, p_file_name text) returns jsonb
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
    select 1 from public.folders where id = p_folder and org_id = v_org
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select id, name into v_doc, v_doc_name from public.documents
  where org_id = v_org
    and coalesce(folder_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(p_folder, '00000000-0000-0000-0000-000000000000'::uuid)
    and lower(name) = lower(v_name)
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

  insert into public.document_versions (document_id, version, storage_path, uploaded_by)
    values (v_doc, v_version, v_path, auth.uid())
    returning id into v_vid;

  return jsonb_build_object(
    'document_id', v_doc, 'version_id', v_vid, 'version', v_version, 'storage_path', v_path
  );
end;
$$;

-- Finishes an upload once the file is in Storage.
create function public.complete_upload(p_version uuid, p_size bigint, p_mime text) returns jsonb
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

-- ---------------------------------------------------------------------------
-- Sharing
-- ---------------------------------------------------------------------------

-- p_items: [{"version_id": "...", "days": 30}, ...]; days null = no expiry.
-- Re-sharing a version that is already live for this exporter updates its expiry.
create function public.share_versions(p_exporter uuid, p_items jsonb) returns int
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

-- Changes how long a live share lasts, counted from now. days null = no expiry.
create function public.set_share_duration(p_share uuid, p_days int) returns void
language plpgsql security definer set search_path = ''
as $$
begin
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

-- Revokes the given live shares owned by the caller's manufacturer. Returns how many were revoked.
create function public.revoke_shares(p_share_ids uuid[]) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_count int;
begin
  if public.current_manufacturer_org_id() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.document_shares
    set revoked_at = now()
    where id = any (p_share_ids)
      and manufacturer_org_id = public.current_manufacturer_org_id()
      and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function
  public.current_manufacturer_org_id(), public.storage_safe(text), public.folder_path(uuid),
  public.create_folder(uuid, text), public.reserve_upload(uuid, text),
  public.complete_upload(uuid, bigint, text), public.share_versions(uuid, jsonb),
  public.set_share_duration(uuid, int), public.revoke_shares(uuid[])
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket + policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800) -- 50 MB per file
on conflict (id) do nothing;

-- Manufacturers may upload only to a path reserved by reserve_upload() for their org.
create policy "manufacturers upload reserved versions"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and exists (
      select 1 from public.document_versions v
      join public.documents d on d.id = v.document_id
      where v.storage_path = storage.objects.name
        and v.status = 'pending'
        and d.org_id = public.current_manufacturer_org_id()
    )
  );

-- Manufacturers may read (download) their own files. Exporter access will go through
-- the server (permission check + access log), not direct storage reads.
create policy "manufacturers read own files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_manufacturer_org_id()::text
  );
