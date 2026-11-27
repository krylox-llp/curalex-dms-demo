-- CuraLex: exporter FPPs (finished pharmaceutical products).
--
-- An exporter groups documents for one FPP from several manufacturers:
--   FPP -> manufacturers (with an optional role, e.g. API manufacturer) -> shared documents.
-- Documents are referenced through their shares, so revocation and expiry show up immediately.
-- Only the exporter can read its FPPs; manufacturers never see them.

create table public.fpps (
  id               uuid primary key default gen_random_uuid(),
  exporter_org_id  uuid not null references public.organizations (id) on delete cascade,
  name             text not null check (length(btrim(name)) between 1 and 200),
  details          text check (details is null or length(details) <= 500),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);
create unique index fpps_unique_name on public.fpps (exporter_org_id, lower(name));

create table public.fpp_manufacturers (
  fpp_id               uuid not null references public.fpps (id) on delete cascade,
  manufacturer_org_id  uuid not null references public.organizations (id) on delete cascade,
  role                 text check (role is null or role in ('finished_product', 'api', 'excipient', 'packaging', 'other')),
  added_at             timestamptz not null default now(),
  primary key (fpp_id, manufacturer_org_id)
);

create table public.fpp_documents (
  fpp_id    uuid not null references public.fpps (id) on delete cascade,
  share_id  uuid not null references public.document_shares (id) on delete cascade,
  added_at  timestamptz not null default now(),
  primary key (fpp_id, share_id)
);
create index fpp_documents_share_idx on public.fpp_documents (share_id);

alter table public.fpps              enable row level security;
alter table public.fpp_manufacturers enable row level security;
alter table public.fpp_documents     enable row level security;

create policy "exporter reads own fpps" on public.fpps for select to authenticated
  using (exporter_org_id = public.current_exporter_org_id());
create policy "exporter reads own fpp manufacturers" on public.fpp_manufacturers for select to authenticated
  using (exists (select 1 from public.fpps f where f.id = fpp_id and f.exporter_org_id = public.current_exporter_org_id()));
create policy "exporter reads own fpp documents" on public.fpp_documents for select to authenticated
  using (exists (select 1 from public.fpps f where f.id = fpp_id and f.exporter_org_id = public.current_exporter_org_id()));

-- The caller's FPP, or an error.
create function public._own_fpp(p_fpp uuid) returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.fpps where id = p_fpp and exporter_org_id = public.current_exporter_org_id();
  if v_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return v_id;
end;
$$;

create function public.create_fpp(p_name text, p_details text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid := public.current_exporter_org_id();
  v_id  uuid;
begin
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

create function public.update_fpp(p_fpp uuid, p_name text, p_details text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public._own_fpp(p_fpp);
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  update public.fpps set name = btrim(p_name), details = nullif(btrim(coalesce(p_details, '')), '') where id = p_fpp;
exception when unique_violation then
  raise exception 'fpp_exists' using errcode = '23505';
end;
$$;

-- Removes the FPP grouping only; shares and files are untouched.
create function public.delete_fpp(p_fpp uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public._own_fpp(p_fpp);
  delete from public.fpps where id = p_fpp;
end;
$$;

-- Adds (or updates the role of) a manufacturer the exporter works with.
create function public.add_fpp_manufacturer(p_fpp uuid, p_manufacturer uuid, p_role text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
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

-- Removes a manufacturer and its documents from the FPP (not the shares themselves).
create function public.remove_fpp_manufacturer(p_fpp uuid, p_manufacturer uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public._own_fpp(p_fpp);
  delete from public.fpp_documents fd
    using public.document_shares s
    where fd.fpp_id = p_fpp and s.id = fd.share_id and s.manufacturer_org_id = p_manufacturer;
  delete from public.fpp_manufacturers where fpp_id = p_fpp and manufacturer_org_id = p_manufacturer;
end;
$$;

-- Adds shared documents to the FPP. Each must be shared with this exporter (not revoked) by a
-- manufacturer already in the FPP. Returns how many were added.
create function public.add_fpp_documents(p_fpp uuid, p_share_ids uuid[]) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_count int;
begin
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

create function public.remove_fpp_document(p_fpp uuid, p_share uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public._own_fpp(p_fpp);
  delete from public.fpp_documents where fpp_id = p_fpp and share_id = p_share;
end;
$$;

-- Manufacturers this exporter works with (for picking FPP manufacturers).
create function public.my_manufacturer_options() returns table (org_id uuid, name text)
language sql stable security definer set search_path = ''
as $$
  select o.id, o.name from public.org_relationships r
  join public.organizations o on o.id = r.manufacturer_org_id
  where r.exporter_org_id = public.current_exporter_org_id()
  order by o.name
$$;

grant execute on function
  public._own_fpp(uuid), public.create_fpp(text, text), public.update_fpp(uuid, text, text),
  public.delete_fpp(uuid), public.add_fpp_manufacturer(uuid, uuid, text),
  public.remove_fpp_manufacturer(uuid, uuid), public.add_fpp_documents(uuid, uuid[]),
  public.remove_fpp_document(uuid, uuid), public.my_manufacturer_options()
to anon, authenticated;
