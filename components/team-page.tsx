import { PageHeader } from "@/components/app-shell";
import { InvitationsTable, InviteColleagueButton, MembersTable, type Invitation, type Member } from "@/components/team";
import { createClient } from "@/lib/supabase/server";

/** Team members, their roles and pending invitations (company admins only). */
export async function TeamPage({ type }: { type: "manufacturer" | "exporter" }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_team");
  if (error) throw new Error(error.message);
  const team = data as { members: Member[]; invitations: Invitation[] };

  return (
    <>
      <PageHeader
        title="Team"
        description="People in your company who can use CuraLex - DMS, and what each of them can do."
        actions={<InviteColleagueButton type={type} />}
      />
      <MembersTable type={type} members={team.members} />
      <InvitationsTable type={type} invitations={team.invitations} />
    </>
  );
}
