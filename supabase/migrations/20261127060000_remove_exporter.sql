-- CuraLex: a manufacturer removes (disconnects) an exporter.
--
-- Revokes every live share to that exporter, takes this manufacturer out of the exporter's FPPs
-- and deletes the relationship, so neither side lists the other any more. Share rows (now revoked)
-- and access_events are kept for audit. Re-inviting the same email reconnects them.

create function public.remove_exporter(p_exporter uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_org     uuid := public.current_manufacturer_org_id();
  v_revoked int;
begin
  if v_org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
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

grant execute on function public.remove_exporter(uuid) to anon, authenticated;
