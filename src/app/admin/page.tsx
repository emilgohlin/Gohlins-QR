import { redirect } from "next/navigation";
import { readAdminSession } from "@/lib/session";
import AdminInloggning from "./AdminInloggning";

export default async function AdminStart() {
  if (await readAdminSession()) redirect("/admin/ordrar");
  return <AdminInloggning />;
}
