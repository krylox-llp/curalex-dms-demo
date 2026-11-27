-- CuraLex: document details (type, product, market, issuer, reference number, issue and expiry dates).
--
-- Details belong to the document (not a version): a renewed certificate is uploaded as a new version
-- and its dates are updated here. Changes go through set_document_details() (documents.edit) and are
-- recorded by the existing audit trigger as "document.updated" with old and new values.

alter table public.documents
  add column doc_type     text check (doc_type in (
    'coa', 'copp', 'gmp', 'licence', 'dmf', 'stability', 'be_study', 'specification',
    'sop', 'validation', 'iso', 'other')),
  add column product      text check (length(product) <= 200),
  add column market       text check (length(market) <= 100),
  add column issued_by    text check (length(issued_by) <= 200),
  add column reference_no text check (length(reference_no) <= 100),
  add column issue_date   date,
  add column expiry_date  date,
  add constraint documents_dates_order check (issue_date is null or expiry_date is null or issue_date <= expiry_date);

create index documents_expiry_idx on public.documents (org_id, expiry_date) where deleted_at is null and expiry_date is not null;

-- Empty strings become null; text is trimmed.
create function public._clean(p text) returns text
language sql immutable set search_path = ''
as $$ select nullif(btrim(p), '') $$;

-- Sets every detail field of a document at once (missing keys are cleared).
create function public.set_document_details(p_document uuid, p_details jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid := public.current_manufacturer_org_id();
  v_issue date;
  v_expiry date;
begin
  perform public._require_permission('documents.edit');
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'invalid_details' using errcode = '22023';
  end if;
  begin
    v_issue := public._clean(p_details ->> 'issue_date')::date;
    v_expiry := public._clean(p_details ->> 'expiry_date')::date;
  exception when others then
    raise exception 'invalid_date' using errcode = '22023';
  end;
  if v_issue is not null and v_expiry is not null and v_issue > v_expiry then
    raise exception 'expiry_before_issue' using errcode = '22023';
  end if;

  update public.documents set
    doc_type     = public._clean(p_details ->> 'doc_type'),
    product      = public._clean(p_details ->> 'product'),
    market       = public._clean(p_details ->> 'market'),
    issued_by    = public._clean(p_details ->> 'issued_by'),
    reference_no = public._clean(p_details ->> 'reference_no'),
    issue_date   = v_issue,
    expiry_date  = v_expiry
  where id = p_document and org_id = v_org and deleted_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
exception
  when check_violation then
    raise exception 'invalid_details' using errcode = '22023';
end;
$$;

-- Exporters see the document's type, product and expiry date with each shared document.
drop function public.my_shared_documents();
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
  expired boolean,
  doc_type text,
  product text,
  document_expiry date,
  latest_version int
)
language sql stable security definer set search_path = ''
as $$
  select s.id, m.id, m.name, d.name, public.folder_path(d.folder_id), v.version, v.size_bytes, v.mime_type,
         s.created_at, s.expires_at, (s.expires_at is not null and s.expires_at <= now()),
         d.doc_type, d.product, d.expiry_date,
         (select max(v2.version) from public.document_versions v2
           where v2.document_id = d.id and v2.deleted_at is null and v2.status = 'ready')
  from public.document_shares s
  join public.document_versions v on v.id = s.version_id and v.deleted_at is null and v.status = 'ready'
  join public.documents d on d.id = v.document_id and d.deleted_at is null
  join public.organizations m on m.id = s.manufacturer_org_id
  where s.exporter_org_id = public.current_exporter_org_id()
    and s.revoked_at is null
  order by m.name, d.name
$$;

-- Granted to anon as well: the local Postgres image crashes on "permission denied for function";
-- every function checks the caller itself.
grant execute on function
  public._clean(text), public.set_document_details(uuid, jsonb), public.my_shared_documents()
to anon, authenticated;
