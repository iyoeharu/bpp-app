import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Search } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: "monthly" | "yearly";
  period: Date;
}

export function DpDetailDialog({ open, onOpenChange, scope, period }: Props) {
  const [search, setSearch] = useState("");

  const range = useMemo(() => {
    const s = scope === "monthly" ? startOfMonth(period) : startOfYear(period);
    const e = scope === "monthly" ? endOfMonth(period) : endOfYear(period);
    return { start: format(s, "yyyy-MM-dd"), end: format(e, "yyyy-MM-dd") };
  }, [scope, period]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["dp_details", scope, range.start, range.end, open],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_contracts")
        .select("id, contract_ref, start_date, dp, omset, total_loan_amount, customers(name, phone), sales_agents(name, agent_code)" as any)
        .neq("status", "returned")
        .gt("dp", 0)
        .gte("start_date", range.start)
        .lte("start_date", range.end)
        .order("dp", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.contract_ref || "").toLowerCase().includes(q) ||
      (r.customers?.name || "").toLowerCase().includes(q) ||
      (r.customers?.phone || "").toLowerCase().includes(q) ||
      (r.sales_agents?.name || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totalDp = useMemo(() => filtered.reduce((s, r) => s + Number(r.dp || 0), 0), [filtered]);
  const title = scope === "monthly"
    ? `Detail Total DP – ${format(period, "MMMM yyyy", { locale: idLocale })}`
    : `Detail Total DP – Tahun ${period.getFullYear()}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Jumlah Kontrak ada DP</p>
              <p className="text-lg font-bold">{filtered.length}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Total DP</p>
              <p className="text-lg font-bold text-amber-600">{formatRupiah(totalDp)}</p>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari kontrak, pelanggan, sales..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="rounded-md border max-h-[450px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>No. Kontrak</TableHead>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead className="text-right">Omset</TableHead>
                  <TableHead className="text-right">DP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Memuat...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Tidak ada kontrak dengan DP</TableCell></TableRow>
                ) : filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{format(new Date(r.start_date), "dd MMM yyyy", { locale: idLocale })}</TableCell>
                    <TableCell className="font-mono text-xs">{r.contract_ref}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.customers?.name || "-"}</div>
                      {r.customers?.phone && <div className="text-xs text-muted-foreground">{r.customers.phone}</div>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.sales_agents?.agent_code ? `${r.sales_agents.agent_code} · ${r.sales_agents.name}` : (r.sales_agents?.name || "-")}
                    </TableCell>
                    <TableCell className="text-right text-indigo-600">{formatRupiah(Number(r.total_loan_amount || 0))}</TableCell>
                    <TableCell className="text-right text-amber-600 font-semibold">{formatRupiah(Number(r.dp || 0))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
