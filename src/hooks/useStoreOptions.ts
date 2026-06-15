import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Hook to gather unique store names from contract_products and nota_payments
export default function useStoreOptions() {
  return useQuery({
    queryKey: ["store_options"],
    queryFn: async () => {
      const { data: cp, error: e1 } = await (supabase as any)
        .from("contract_products")
        .select("store");
      if (e1) throw e1;

      const { data: np, error: e2 } = await (supabase as any)
        .from("nota_payments")
        .select("store");
      if (e2) throw e2;

      const set = new Set<string>();
      (cp || []).forEach((r: any) => {
        const s = (r.store || "").toString().trim();
        if (s) set.add(s);
      });
      (np || []).forEach((r: any) => {
        const s = (r.store || "").toString().trim();
        if (s) set.add(s);
      });

      return Array.from(set).sort((a, b) => a.localeCompare(b));
    },
  });
}
