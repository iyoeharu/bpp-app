import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRupiah } from "@/lib/format";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  addMonths,
  subMonths,
  addYears,
  subYears,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  Wallet,
  Receipt,
  Banknote,
  TrendingDown,
  Users,
  HandCoins,
  CreditCard,
  Percent,
  PiggyBank,
  ChevronLeft,
  ChevronRight,
  ArrowDown,
  ArrowUp,
} from "lucide-react";

type Period = "monthly" | "yearly";

export default function NotaDashboard() {
  const [period, setPeriod] = useState<Period>("monthly");
  const [periodDate, setPeriodDate] = useState<Date>(new Date());

  const range = useMemo(() => {
    const start = period === "yearly" ? startOfYear(periodDate) : startOfMonth(periodDate);
    const end = period === "yearly" ? endOfYear(periodDate) : endOfMonth(periodDate);
    return {
      start: format(start, "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd"),
    };
  }, [period, periodDate]);

  const periodLabel = useMemo(
    () =>
      period === "yearly"
        ? `Tahun ${periodDate.getFullYear()}`
        : format(periodDate, "MMMM yyyy", { locale: idLocale }),
    [period, periodDate]
  );

  const shiftPeriod = (delta: number) => {
    if (period === "yearly") {
      setPeriodDate((d) => (delta > 0 ? addYears(d, 1) : subYears(d, 1)));
    } else {
      setPeriodDate((d) => (delta > 0 ? addMonths(d, 1) : subMonths(d, 1)));
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["nota_dashboard", range.start, range.end],
    queryFn: async () => {
      const [
        paymentsRes,
        expensesRes,
        notaPayRes,
        productsRes,
        contractsRes,
        commissionsRes,
      ] = await Promise.all([
        (supabase as any)
          .from("payment_logs")
          .select("amount_paid, payment_date")
          .gte("payment_date", range.start)
          .lte("payment_date", range.end),
        (supabase as any)
          .from("operational_expenses")
          .select("amount, category, expense_date")
          .gte("expense_date", range.start)
          .lte("expense_date", range.end),
        (supabase as any)
          .from("nota_payments")
          .select("amount, payment_date")
          .gte("payment_date", range.start)
          .lte("payment_date", range.end),
        (supabase as any)
          .from("contract_products")
          .select("price, status, credit_contracts!inner(start_date)")
          .gte("credit_contracts.start_date", range.start)
          .lte("credit_contracts.start_date", range.end),
        (supabase as any)
          .from("credit_contracts")
          .select("dp, start_date, status")
          .neq("status", "returned")
          .gte("start_date", range.start)
          .lte("start_date", range.end),
        (supabase as any)
          .from("commission_payments")
          .select("amount, payment_date")
          .gte("payment_date", range.start)
          .lte("payment_date", range.end),
      ]);

      const err =
        paymentsRes.error ||
        expensesRes.error ||
        notaPayRes.error ||
        productsRes.error ||
        contractsRes.error ||
        commissionsRes.error;
      if (err) throw err;

      const totalTertagih = (paymentsRes.data || []).reduce(
        (s: number, p: any) => s + Number(p.amount_paid || 0),
        0
      );

      let gajiKaryawan = 0;
      let gajiKolektor = 0;
      let biayaOperasional = 0;
      for (const e of expensesRes.data || []) {
        const amt = Number(e.amount || 0);
        if (e.category === "Gaji Karyawan") gajiKaryawan += amt;
        else if (e.category === "Gaji Kolektor") gajiKolektor += amt;
        else biayaOperasional += amt;
      }

      const bayarHutang = (notaPayRes.data || []).reduce(
        (s: number, p: any) => s + Number(p.amount || 0),
        0
      );

      let totalCash = 0;
      let totalInvoice = 0;
      for (const r of productsRes.data || []) {
        const amt = Number(r.price || 0);
        if (r.status === "cash") totalCash += amt;
        else totalInvoice += amt;
      }

      const totalDp = (contractsRes.data || []).reduce(
        (s: number, c: any) => s + Number(c.dp || 0),
        0
      );

      const komisiSales = (commissionsRes.data || []).reduce(
        (s: number, p: any) => s + Number(p.amount || 0),
        0
      );

      const sisaDuit =
        totalTertagih -
        biayaOperasional -
        gajiKaryawan -
        gajiKolektor -
        bayarHutang -
        totalCash -
        komisiSales -
        totalDp;

      return {
        totalTertagih,
        biayaOperasional,
        gajiKaryawan,
        gajiKolektor,
        bayarHutang,
        totalCash,
        totalInvoice,
        totalDp,
        komisiSales,
        sisaDuit,
      };
    },
  });

  const d = data;

  const totalPemasukan = (d?.totalTertagih || 0) + (d?.totalDp || 0);
  const inflowCards = [
    { label: "Total Tertagih", value: d?.totalTertagih || 0, icon: ArrowUp, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Total DP", value: d?.totalDp || 0, icon: Wallet, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Total Pemasukan", value: totalPemasukan, icon: Banknote, color: "text-emerald-700", bg: "bg-emerald-100" },
  ];

  const outflowCards = [
    { label: "Biaya Operasional", value: d?.biayaOperasional || 0, icon: TrendingDown, color: "text-orange-600", bg: "bg-orange-50" },
    { label: "Gaji Karyawan", value: d?.gajiKaryawan || 0, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Gaji Kolektor", value: d?.gajiKolektor || 0, icon: Users, color: "text-cyan-600", bg: "bg-cyan-50" },
    { label: "Bayar Hutang", value: d?.bayarHutang || 0, icon: HandCoins, color: "text-rose-600", bg: "bg-rose-50" },
    { label: "Bayar Cash", value: d?.totalCash || 0, icon: CreditCard, color: "text-pink-600", bg: "bg-pink-50" },
    { label: "Komisi Sales", value: d?.komisiSales || 0, icon: Percent, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  const totalOutflow =
    (d?.biayaOperasional || 0) +
    (d?.gajiKaryawan || 0) +
    (d?.gajiKolektor || 0) +
    (d?.bayarHutang || 0) +
    (d?.totalCash || 0) +
    (d?.komisiSales || 0) +
    0;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Catatan Keuangan</h1>
          <p className="text-sm text-muted-foreground">
            Ringkasan keuangan periode {periodLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v: Period) => setPeriod(v)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Bulanan</SelectItem>
              <SelectItem value="yearly">Tahunan</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => shiftPeriod(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[140px] text-center text-sm font-medium">{periodLabel}</div>
          <Button variant="outline" size="icon" onClick={() => shiftPeriod(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPeriodDate(new Date())}>
            Hari Ini
          </Button>
        </div>
      </div>

      {/* Sisa Duit Tagihan - hero card */}
      <Card className="border-2 border-primary/40 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <PiggyBank className="h-5 w-5 text-primary" />
            Sisa Duit Tagihan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`text-3xl font-bold ${
              (d?.sisaDuit || 0) >= 0 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {isLoading ? "..." : formatRupiah(d?.sisaDuit || 0)}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Total Tertagih − Biaya Operasional − Gaji Karyawan − Gaji Kolektor − Bayar Hutang − Bayar
            Cash − Komisi Sales + Total DP
          </p>
        </CardContent>
      </Card>

      {/* Pemasukan */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <ArrowUp className="h-4 w-4 text-emerald-600" /> PEMASUKAN
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {inflowCards.map((c) => (
            <Card key={c.label}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className={`rounded-lg p-3 ${c.bg}`}>
                  <c.icon className={`h-5 w-5 ${c.color}`} />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className={`text-xl font-bold ${c.color}`}>
                    {isLoading ? "..." : formatRupiah(c.value)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Pengeluaran */}
      <div>
        <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-muted-foreground">
          <span className="flex items-center gap-2">
            <ArrowDown className="h-4 w-4 text-red-600" /> PENGELUARAN
          </span>
          <span className="text-xs">
            Total: <span className="font-bold text-red-600">{formatRupiah(totalOutflow)}</span>
          </span>
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {outflowCards.map((c) => (
            <Card key={c.label}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className={`rounded-lg p-3 ${c.bg}`}>
                  <c.icon className={`h-5 w-5 ${c.color}`} />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className={`text-xl font-bold ${c.color}`}>
                    {isLoading ? "..." : formatRupiah(c.value)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
