import "server-only";

import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { ensureEasyTUser } from "./repository";

export type EasyTOwner = {
  id: string;
  email: string;
  name: string | null;
};

export function isEasyTAdmin(email: string) {
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}

export async function requireEasyTOwner(): Promise<EasyTOwner> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user?.id || !session.user.email) throw new Error("Unauthorized");
  const owner = { id: session.user.id, email: session.user.email, name: session.user.name ?? null };
  await ensureEasyTUser(owner.id, owner.email, owner.name);
  return owner;
}
