import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Player from "../components/Player";
import { COOKIE, isValid } from "../lib/server/auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!isValid((await cookies()).get(COOKIE)?.value)) redirect("/login");
  return <Player />;
}
