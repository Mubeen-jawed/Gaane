import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, isValid } from "../../lib/server/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gaane — Sign in" };

export default async function Login() {
  if (isValid((await cookies()).get(COOKIE)?.value)) redirect("/");
  return <LoginForm />;
}
