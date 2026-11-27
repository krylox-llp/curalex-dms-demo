-- CuraLex: exporters opening shared documents, with an access log manufacturers can see.
--
-- Exporters never read Storage directly. The app server calls record_document_access(), which
-- checks the share is live, appends an access_events row and returns the storage path; only then
-- does the server issue a short-lived signed URL.

create table public.access_events (
  id                   bigint generated always as identity primary key,
  share_id             uuid not null references public.document_shares (id) on delete cascade,
  version_id           uuid not null references public.document_versions (id) on delete cascade,
  manufacturer_org_id  uuid not null references public.organizations (id) on delete cascade,
  exporter_org_id      uuid not null references public.organizations (id) on delete cascade,
  user_id              uuid references auth.users (id) on delete set null,
  user_email           text,
  action               text not null check (action in ('view', 'download')),
  created_at           timestamptz not null default now()
);
create index access_events_share_idx on public.access_events (share_id, created_at desc);
create index access_events_manufacturer_idx on public.access_events (manufacturer_org_id, created_at desc);
create index access_events_exporter_idx on public.access_events (exporter_org_id, created_at desc);

-- Append-only: readable by both parties of the share, writable only through record_document_access().
alter table public.access_events enable row level security;
create policy "read access events of your shares" on public.access_events for select to authenticated
  using (manufacturer_org_id = public.current_org_id() or exporter_org_id = public.current_org_id());

-- The caller's org id, but only if it is an exporter.
create function public.current_exporter_org_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select o.id from public.memberships m
  join public.organizations o on o.id = m.org_id
  where m.user_id = auth.uid() and o.type = 'exporter'
$$;

-- Documents shared with the caller's exporter (not revoked; expired ones are flagged, not hidden).
create function public.my_shared_documents() returns table (
  share_id uuid,
  manufacturer_id uuid,
  manufacturer_name text,
  file_name text,
  folder_path text,
  version int,
  size_bytes bigint,
  mime_type text,
  shared_at timestamptz,
  expires_at timestamptz,
  expired boolean
)
language sql stable security definer set search_path = ''
as $$
  select s.id, m.id, m.name, d.name, public.folder_path(d.folder_id), v.version, v.size_bytes, v.mime_type,
         s.created_at, s.expires_at, (s.expires_at is not null and s.expires_at <= now())
  from public.document_shares s
  join public.document_versions v on v.id = s.version_id and v.deleted_at is null and v.status = 'ready'
  join public.documents d on d.id = v.document_id and d.deleted_at is null
  join public.organizations m on m.id = s.manufacturer_org_id
  where s.exporter_org_id = public.current_exporter_org_id()
    and s.revoked_at is null
  order by m.name, d.name
$$;

-- Checks the caller may open this share now, logs the access and returns what the server needs
-- to issue a signed URL. Raises 'no_access' for revoked, expired, deleted or someone else's shares.
create function public.record_document_access(p_share uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_exporter uuid := public.current_exporter_org_id();
  v_row record;
begin
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
  public.current_exporter_org_id(), public.my_shared_documents(), public.record_document_access(uuid, text)
to anon, authenticated;
