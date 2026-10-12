import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Plus } from "lucide-react";

export default async function UnitsPage({
  params,
}: {
  params: { associationId: string };
}) {
  const ctx = await getTenantContext(params.associationId);
  const supabase = createClient();

  const { data: units } = await supabase
    .from("units")
    .select("id, label, address, status, created_at")
    .eq("association_id", ctx.associationId)
    .order("label", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Units</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {units?.length || 0} unit{(units?.length || 0) !== 1 ? "s" : ""} registered
          </p>
        </div>
        <Button variant="primary" size="md">
          <Plus className="h-4 w-4" /> Add Unit
        </Button>
      </div>

      {(!units || units.length === 0) ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <Building2 className="mx-auto h-12 w-12 text-zinc-300 dark:text-zinc-600" />
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">No units registered yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {units.map((unit) => (
            <div
              key={unit.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-zinc-900 dark:text-zinc-100">{unit.label}</h3>
                  {unit.address && (
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{unit.address}</p>
                  )}
                </div>
                <Badge variant={unit.status === "active" ? "active" : "inactive"}>
                  {unit.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
