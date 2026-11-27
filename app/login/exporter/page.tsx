import type { Metadata } from "next";
import { RoleLogin } from "@/components/login/role-login";

export const metadata: Metadata = { title: "Exporter sign in · CuraLex - DMS" };

export default function ExporterLoginPage({ searchParams }: PageProps<"/login/exporter">) {
  return <RoleLogin role="exporter" searchParams={searchParams} />;
}
