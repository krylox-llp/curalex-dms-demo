import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAccount, homeFor } from "@/lib/account";

export default function Home() {
  return (
    <Suspense>
      <RedirectToHome />
    </Suspense>
  );
}

async function RedirectToHome() {
  const account = await getAccount();
  if (!account) redirect("/login");
  redirect(homeFor(account) ?? "/login?error=not_invited");
  return null;
}
