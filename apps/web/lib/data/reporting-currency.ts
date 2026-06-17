import "server-only"
import { createServerClient } from "@/lib/supabase/server"

export async function getReportingCurrency(): Promise<string> {
  const supabase = await createServerClient()
  const { data } = await supabase
    .from("entities")
    .select("base_currency")
    .eq("active", true)
    .limit(1)
    .single()
  return data?.base_currency ?? "USD"
}
