import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Plus, Upload } from "lucide-react";
import Link from "next/link";

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: { associationId: string };
  searchParams: { search?: string; page?: string };
}) {
  const ctx = await getTenantContext(params.associationId);
  const supabase = createClient();
  const search = searchParams.search || "";
  const page = parseInt(searchParams.page || "1", 10);
  const pageSize = 20;

  let query = supabase
    .from("association_memberships")
    .select("id, user_id, unit_label, role, status, created_at, profiles(full_name)", { count: "exact" })
    .eq("association_id", ctx.associationId)
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (search) {
    query = query.ilike("profiles.full_name", `%${search}%`);
  }

  const { data: members, count } = await query;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Members</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {count || 0} member{(count || 0) !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/${params.associationId}/members/import`}>
            <Button variant="outline" size="md">
              <Upload className="h-4 w-4" /> Import CSV
            </Button>
          </Link>
          <Button variant="primary" size="md">
            <Plus className="h-4 w-4" /> Add Member
          </Button>
        </div>
      </div>

      {/* Search */}
      <form className="flex gap-2">
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="Search by name..."
          className="flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <Button variant="outline" type="submit">Search</Button>
      </form>

      {(!members || members.length === 0) ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <Users className="mx-auto h-12 w-12 text-zinc-300 dark:text-zinc-600" />
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">No members found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Unit</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const profile = m.profiles as { full_name: string } | null;
                return (
                  <tr key={m.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                    <td className="px-4 py-2.5 text-zinc-900 dark:text-zinc-100">
                      {profile?.full_name || "Unclaimed"}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-700 dark:text-zinc-300">
                      {m.unit_label || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-700 dark:text-zinc-300">
                      {m.role.replace("_", " ")}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant={
                          m.status === "active" ? "active" :
                          m.status === "invited" ? "pending" :
                          m.status === "suspended" ? "rejected" : "inactive"
                        }
                      >
                        {m.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="ghost" size="sm">Edit</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
