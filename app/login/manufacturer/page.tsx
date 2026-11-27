import type { Metadata } from "next";
import { RoleLogin } from "@/components/login/role-login";

export const metadata: Metadata = { title: "Manufacturer sign in · CuraLex - DMS" };

export default function ManufacturerLoginPage({ searchParams }: PageProps<"/login/manufacturer">) {
  return <RoleLogin role="manufacturer" searchParams={searchParams} />;
}
