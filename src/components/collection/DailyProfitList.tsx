import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TrendingUp, Wallet, Coins, Receipt, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { usePayments } from "@/hooks/usePayments";
import { useContracts } from "@/hooks/useContracts";
import { useCouponHandovers } from "@/hooks/useCouponHandovers";
import { formatRupiah, formatDate } from "@/lib/format";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths } from "date-fns";
import { id } from "date-fns/locale";

interface DailyProfit {
  date: string;
  coupons: number;
  tagihan: number;
  collected: number;
  modal: number;
  profit: number;
  margin: number;
  contracts: Array<{
    contract_id: string;
    contract_ref: string;
    customer_name: string;
    coupons: number;
    amount: number;
    profit: number;
  }>;
}

export function DailyProfitList() {
  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState<"daily" | "monthly">("daily");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<DailyProfit | null>(null);
  const [detailPage, setDetailPage] = useState(1);
  const DETAIL_PAGE_SIZE = 10;

  useEffect(() => {
    setDetailPage(1);
  }, [selectedDate]);

  // Daily view data
  const { data: dailyPayments, isLoading: dailyLoading } = usePayments(selectedDate, selectedDate);
  const { data: dailyHandovers } = useCouponHandovers(selectedDate);

  // Monthly view data
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const { data: monthlyPayments, isLoading: monthlyLoading } = usePayments(
    format(monthStart, "yyyy-MM-dd"),
    format(monthEnd, "yyyy-MM-dd")
  );

  const { data: contracts, isLoading: contractsLoading } = useContracts();

  const isLoading = dailyLoading || monthlyLoading || contractsLoading;

  // Build contract map
  const contractMap = useMemo(() => {
    const map = new Map<
      string,
      {
        contract_ref: string;
        customer_name: string;
        tenor_days: number;
        total_loan_amount: number;
        modal_total: number;
        profit_total: number;
        profit_per_coupon: number;
        modal_per_coupon: number;
        omset_per_coupon: number;
        daily_installment_amount: number;
      }
    >();
    (contracts || []).forEach((c: any) => {
      const omsetTotal = Number(c.total_loan_amount || 0);
      const modalTotal = Number(c.omset || 0);
      const profitTotal = omsetTotal - modalTotal;
      const tenor = Number(c.tenor_days || 0) || 1;
      map.set(c.id, {
        contract_ref: c.contract_ref,
        customer_name: c.customers?.name || "-",
        tenor_days: tenor,
        total_loan_amount: omsetTotal,
        modal_total: modalTotal,
        profit_total: profitTotal,
        profit_per_coupon: profitTotal / tenor,
        modal_per_coupon: modalTotal / tenor,
        omset_per_coupon: omsetTotal / tenor,
        daily_installment_amount: Number(c.daily_installment_amount || 0),
      });
    });
    return map;
  }, [contracts]);

  // Build handover map for selected date: contract_id -> total KB
  const dailyHandoverMap = useMemo(() => {
    const m = new Map<string, number>();
    (dailyHandovers || []).forEach((h: any) => {
      m.set(h.contract_id, (m.get(h.contract_id) || 0) + (h.coupon_count || 0));
    });
    return m;
  }, [dailyHandovers]);

  // DAILY VIEW: Aggregate per contract for selected date
  const dailyRows = useMemo(() => {
    if (!dailyPayments) return [];
    const grouped = new Map<
      string,
      {
        contract_id: string;
        contract_ref: string;
        customer_name: string;
        kupon_bawa: number;
        kupon_pulang: number;
        coupons_paid: number;
        total_tagihan: number;
        collected: number;
        modal_portion: number;
        profit_portion: number;
      }
    >();

    dailyPayments.forEach((p: any) => {
      const info = contractMap.get(p.contract_id);
      
      // Handle missing contracts - still count the payment!
      if (!info) {
        console.warn(`⚠️ Missing contract data for payment ${p.id} with contract_id: ${p.contract_id}`);
        const existing = grouped.get(p.contract_id) || {
          contract_id: p.contract_id,
          contract_ref: p.credit_contracts?.contract_ref || `[Unknown-${p.contract_id.substring(0, 8)}]`,
          customer_name: p.credit_contracts?.customers?.name || "[Contract Data Missing]",
          kupon_bawa: 0,
          kupon_pulang: 0,
          coupons_paid: 0,
          total_tagihan: 0,
          collected: 0,
          modal_portion: 0,
          profit_portion: 0,
        };
        existing.coupons_paid += 1;
        existing.collected += Number(p.amount_paid || 0);
        grouped.set(p.contract_id, existing);
        return;
      }

      const existing = grouped.get(p.contract_id) || {
        contract_id: p.contract_id,
        contract_ref: info.contract_ref,
        customer_name: info.customer_name,
        kupon_bawa: 0,
        kupon_pulang: 0,
        coupons_paid: 0,
        total_tagihan: 0,
        collected: 0,
        modal_portion: 0,
        profit_portion: 0,
      };
      existing.coupons_paid += 1;
      existing.total_tagihan += info.daily_installment_amount;
      existing.collected += Number(p.amount_paid || 0);
      existing.modal_portion += info.modal_per_coupon;
      existing.profit_portion += info.profit_per_coupon;
      grouped.set(p.contract_id, existing);
    });

    // Add handover-only rows (KB but no payment) and fill KB/KP
    dailyHandoverMap.forEach((kb, contractId) => {
      const info = contractMap.get(contractId);
      if (!info) return;
      if (!grouped.has(contractId)) {
        grouped.set(contractId, {
          contract_id: contractId,
          contract_ref: info.contract_ref,
          customer_name: info.customer_name,
          kupon_bawa: kb,
          kupon_pulang: kb,
          coupons_paid: 0,
          total_tagihan: kb * info.daily_installment_amount,
          collected: 0,
          modal_portion: 0,
          profit_portion: 0,
        });
      } else {
        const r = grouped.get(contractId)!;
        r.kupon_bawa = kb;
        r.kupon_pulang = Math.max(0, kb - r.coupons_paid);
        // Override total_tagihan to KB-based
        r.total_tagihan = kb * info.daily_installment_amount;
      }
    });

    return Array.from(grouped.values()).sort((a, b) => b.profit_portion - a.profit_portion);
  }, [dailyPayments, contractMap, dailyHandoverMap]);

  // DAILY VIEW: Summary
  const dailyTotals = useMemo(() => {
    return dailyRows.reduce(
      (acc, r) => {
        acc.coupons += r.coupons_paid;
        acc.tagihan += r.total_tagihan;
        acc.collected += r.collected;
        acc.modal += r.modal_portion;
        acc.profit += r.profit_portion;
        return acc;
      },
      { coupons: 0, tagihan: 0, collected: 0, modal: 0, profit: 0 }
    );
  }, [dailyRows]);

  const dailyMargin =
    dailyTotals.collected > 0 ? (dailyTotals.profit / dailyTotals.collected) * 100 : 0;

  // MONTHLY VIEW: Calculate daily profits
  const monthlyDailyProfits = useMemo(() => {
    const map = new Map<string, DailyProfit>();

    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    days.forEach((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      map.set(dateStr, {
        date: dateStr,
        coupons: 0,
        tagihan: 0,
        collected: 0,
        modal: 0,
        profit: 0,
        margin: 0,
        contracts: [],
      });
    });

    (monthlyPayments || []).forEach((p: any) => {
      const info = contractMap.get(p.contract_id);
      const dateStr = p.payment_date || format(new Date(p.created_at), "yyyy-MM-dd");
      const daily = map.get(dateStr);
      if (!daily) return;

      const amount = Number(p.amount_paid || 0);
      daily.coupons += 1;
      daily.collected += amount;
      
      // Only add contract-based calculations if contract info exists
      if (info) {
        daily.tagihan += info.daily_installment_amount;
        daily.modal += info.modal_per_coupon;
        daily.profit += info.profit_per_coupon;
      }

      const existingContract = daily.contracts.find((c) => c.contract_id === p.contract_id);
      if (existingContract) {
        existingContract.coupons += 1;
        existingContract.amount += amount;
        existingContract.profit += info.profit_per_coupon;
      } else {
        daily.contracts.push({
          contract_id: p.contract_id,
          contract_ref: info.contract_ref,
          customer_name: info.customer_name,
          coupons: 1,
          amount,
          profit: info.profit_per_coupon,
        });
      }
    });

    map.forEach((daily) => {
      daily.margin = daily.collected > 0 ? (daily.profit / daily.collected) * 100 : 0;
    });

    return map;
  }, [monthlyPayments, contractMap, monthStart, monthEnd]);

  // MONTHLY VIEW: Summary
  const monthlySummary = useMemo(() => {
    let totalCoupons = 0,
      totalTagihan = 0,
      totalCollected = 0,
      totalModal = 0,
      totalProfit = 0,
      totalDays = 0;

    monthlyDailyProfits.forEach((daily) => {
      if (daily.profit > 0 || daily.coupons > 0) totalDays += 1;
      totalCoupons += daily.coupons;
      totalTagihan += daily.tagihan;
      totalCollected += daily.collected;
      totalModal += daily.modal;
      totalProfit += daily.profit;
    });

    const avgDaily = totalDays > 0 ? totalProfit / totalDays : 0;
    const margin = totalCollected > 0 ? (totalProfit / totalCollected) * 100 : 0;

    return { totalCoupons, totalTagihan, totalCollected, totalModal, totalProfit, totalDays, avgDaily, margin };
  }, [monthlyDailyProfits]);

  // Get max daily profit for color coding
  const maxDailyProfit = useMemo(() => {
    let max = 0;
    monthlyDailyProfits.forEach((daily) => {
      if (daily.profit > max) max = daily.profit;
    });
    return max || 1;
  }, [monthlyDailyProfits]);

  const getProfitLevel = (profit: number) => {
    if (profit === 0) return "gray";
    const ratio = profit / maxDailyProfit;
    if (ratio >= 0.7) return "green";
    if (ratio >= 0.4) return "yellow";
    return "red";
  };

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  return (
    <div className="space-y-4">
      {/* View Mode Toggle */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Keuntungan Harian</CardTitle>
              <CardDescription>Pilih tampilan harian atau bulanan</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "daily" | "monthly")}>
            <TabsList>
              <TabsTrigger value="daily" className="gap-2">
                <Receipt className="h-4 w-4" />
                Harian
              </TabsTrigger>
              <TabsTrigger value="monthly" className="gap-2">
                <Calendar className="h-4 w-4" />
                Bulanan
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {/* DAILY VIEW */}
      {viewMode === "daily" && (
        <div className="space-y-4">
          {/* Date Filter */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Filter Tanggal</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-w-xs">
                <Label htmlFor="profit-date">Pilih Tanggal</Label>
                <Input
                  id="profit-date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Receipt className="h-4 w-4" /> Kupon Tertagih
                </div>
                <div className="text-2xl font-bold">{dailyTotals.coupons}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Wallet className="h-4 w-4" /> Total Tertagih
                </div>
                <div className="text-2xl font-bold">{formatRupiah(dailyTotals.collected)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Wallet className="h-4 w-4" /> Total Tagihan
                </div>
                <div className="text-2xl font-bold">{formatRupiah(dailyTotals.tagihan)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Coins className="h-4 w-4" /> Porsi Modal
                </div>
                <div className="text-2xl font-bold">{formatRupiah(dailyTotals.modal)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <TrendingUp className="h-4 w-4" /> Keuntungan
                </div>
                <div className="text-2xl font-bold text-primary">{formatRupiah(dailyTotals.profit)}</div>
                <div className="text-xs text-muted-foreground mt-1">Margin {dailyMargin.toFixed(1)}%</div>
              </CardContent>
            </Card>
          </div>

          {/* Detail Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Detail per Kontrak — {formatDate(selectedDate)}</CardTitle>
              <CardDescription>Rincian kupon yang dibayar pada tanggal terpilih</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="rounded-md border w-full" style={{ maxHeight: "500px" }}>
                <div className="w-full min-w-max">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kontrak</TableHead>
                        <TableHead>Pelanggan</TableHead>
                        <TableHead className="text-center">KB</TableHead>
                        <TableHead className="text-center">KP</TableHead>
                        <TableHead className="text-center">Kupon dibayar</TableHead>
                        <TableHead className="text-right">Total Tagihan</TableHead>
                        <TableHead className="text-right">Tertagih</TableHead>
                        <TableHead className="text-right">Modal</TableHead>
                        <TableHead className="text-right">Keuntungan</TableHead>
                      </TableRow>
                    </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-6 text-muted-foreground">
                          Memuat data...
                        </TableCell>
                      </TableRow>
                    ) : dailyRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-6 text-muted-foreground">
                          Tidak ada pembayaran pada tanggal ini.
                        </TableCell>
                      </TableRow>
                    ) : (
                      dailyRows
                        .slice((detailPage - 1) * DETAIL_PAGE_SIZE, detailPage * DETAIL_PAGE_SIZE)
                        .map((r) => {
                        return (
                          <TableRow key={r.contract_id}>
                            <TableCell className="font-mono text-xs">{r.contract_ref}</TableCell>
                            <TableCell>{r.customer_name}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline">{r.kupon_bawa}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={r.kupon_pulang > 0 ? "destructive" : "outline"}>{r.kupon_pulang}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary">{r.coupons_paid}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">{formatRupiah(r.total_tagihan)}</TableCell>
                            <TableCell className="text-right">{formatRupiah(r.collected)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatRupiah(r.modal_portion)}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-primary">
                              {formatRupiah(r.profit_portion)}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
                </div>
              </ScrollArea>
              {dailyRows.length > 0 && (() => {
                const totalPages = Math.max(1, Math.ceil(dailyRows.length / DETAIL_PAGE_SIZE));
                const currentPage = Math.min(detailPage, totalPages);
                const from = (currentPage - 1) * DETAIL_PAGE_SIZE + 1;
                const to = Math.min(currentPage * DETAIL_PAGE_SIZE, dailyRows.length);
                return (
                  <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
                    <div className="text-xs text-muted-foreground">
                      Menampilkan {from}–{to} dari {dailyRows.length} kontrak
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDetailPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Sebelumnya
                      </Button>
                      <div className="text-xs text-muted-foreground">
                        Halaman {currentPage} / {totalPages}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDetailPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                      >
                        Berikutnya
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* MONTHLY VIEW */}
      {viewMode === "monthly" && (
        <div className="space-y-4">
          {/* Month Navigation */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Kalender Keuntungan Bulanan
                  </CardTitle>
                  <CardDescription>Klik tanggal untuk melihat detail pembayaran</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h2 className="text-lg font-semibold min-w-[150px] text-center">
                  {format(currentMonth, "MMMM yyyy", { locale: id })}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Monthly Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Receipt className="h-4 w-4" />
                  Total Kupon
                </div>
                <div className="text-2xl font-bold">{monthlySummary.totalCoupons}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Calendar className="h-4 w-4" />
                  Hari Aktif
                </div>
                <div className="text-2xl font-bold">{monthlySummary.totalDays}</div>
                <div className="text-xs text-muted-foreground mt-1">dari {days.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Wallet className="h-4 w-4" />
                  Total Tagihan
                </div>
                <div className="text-2xl font-bold">{formatRupiah(monthlySummary.totalTagihan)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Wallet className="h-4 w-4" />
                  Total Tertagih
                </div>
                <div className="text-2xl font-bold">
                  {formatRupiah(monthlySummary.totalCollected)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <TrendingUp className="h-4 w-4" />
                  Total Profit
                </div>
                <div className="text-2xl font-bold text-green-600">
                  {formatRupiah(monthlySummary.totalProfit)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Margin {monthlySummary.margin.toFixed(1)}%
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Coins className="h-4 w-4" />
                  Rata-rata Harian
                </div>
                <div className="text-2xl font-bold">
                  {formatRupiah(monthlySummary.avgDaily)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Calendar Grid */}
          <Card>
            <CardContent className="pt-6">
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">Memuat data...</div>
              ) : (
                <div className="space-y-4">
                  {/* Legend */}
                  <div className="flex flex-wrap gap-3 text-xs pb-3 border-b">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-green-500" />
                      <span>Bagus (70%+)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-yellow-500" />
                      <span>Sedang (40-70%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-red-500" />
                      <span>Rendah (&lt;40%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-gray-300" />
                      <span>Tidak Ada Data</span>
                    </div>
                  </div>

                  {/* Day Headers */}
                  <div className="grid grid-cols-7 gap-2 mb-2">
                    {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((day) => (
                      <div key={day} className="text-center font-semibold text-sm text-muted-foreground">
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* Calendar Days */}
                  <div className="grid grid-cols-7 gap-2">
                    {Array(monthStart.getDay())
                      .fill(null)
                      .map((_, i) => (
                        <div key={`empty-${i}`} className="aspect-square" />
                      ))}

                    {days.map((day) => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const daily = monthlyDailyProfits.get(dateStr) || {
                        date: dateStr,
                        coupons: 0,
                        tagihan: 0,
                        collected: 0,
                        modal: 0,
                        profit: 0,
                        margin: 0,
                        contracts: [],
                      };

                      const level = getProfitLevel(daily.profit);
                      const bgColor =
                        level === "green"
                          ? "bg-green-100 hover:bg-green-200"
                          : level === "yellow"
                            ? "bg-yellow-100 hover:bg-yellow-200"
                            : level === "red"
                              ? "bg-red-100 hover:bg-red-200"
                              : "bg-gray-100 hover:bg-gray-200";

                      return (
                        <button
                          key={dateStr}
                          onClick={() => setSelectedDay(daily)}
                          className={`aspect-square rounded-lg p-2 text-left text-sm transition-colors cursor-pointer border ${bgColor} border-transparent hover:border-primary`}
                        >
                          <div className="font-semibold">{format(day, "d")}</div>
                          {daily.coupons > 0 && (
                            <>
                              <div className="text-xs font-medium text-primary mt-1">
                                {formatRupiah(daily.profit)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {daily.coupons} kupon
                              </div>
                            </>
                          )}
                          {daily.coupons === 0 && (
                            <div className="text-xs text-muted-foreground">-</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detail Modal untuk Monthly View */}
      <Dialog open={!!selectedDay} onOpenChange={() => setSelectedDay(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Detail Keuntungan — {selectedDay ? format(new Date(selectedDay.date), "dd MMMM yyyy", { locale: id }) : ""}
            </DialogTitle>
            <DialogDescription>
              Rincian per kontrak yang membayar pada tanggal ini
            </DialogDescription>
          </DialogHeader>

          {selectedDay && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-muted p-3">
                  <div className="text-xs text-muted-foreground">Kupon</div>
                  <div className="text-lg font-bold">{selectedDay.coupons}</div>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <div className="text-xs text-muted-foreground">Tertagih</div>
                  <div className="text-sm font-bold break-words">{formatRupiah(selectedDay.collected)}</div>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <div className="text-xs text-muted-foreground">Modal</div>
                  <div className="text-sm font-bold break-words">{formatRupiah(selectedDay.modal)}</div>
                </div>
                <div className="rounded-lg bg-green-100 p-3">
                  <div className="text-xs text-muted-foreground">Profit</div>
                  <div className="text-lg font-bold text-green-600 break-words">
                    {formatRupiah(selectedDay.profit)}
                  </div>
                </div>
              </div>

              {/* Contracts List dengan Scroll */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Kontrak yang Membayar:</h4>
                {selectedDay.contracts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Tidak ada pembayaran</p>
                ) : (
                  <ScrollArea className="rounded-lg border" style={{ height: "290px" }}>
                    <div className="space-y-2 p-4">
                      {selectedDay.contracts.map((contract) => (
                        <div
                          key={contract.contract_id}
                          className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-sm font-semibold truncate">{contract.contract_ref}</div>
                            <div className="text-sm text-muted-foreground truncate">{contract.customer_name}</div>
                            <Badge variant="secondary" className="mt-1 text-xs">
                              {contract.coupons} kupon
                            </Badge>
                          </div>
                          <div className="text-left sm:text-right flex-shrink-0">
                            <div className="text-xs text-muted-foreground font-medium">
                              {formatRupiah(contract.amount)}
                            </div>
                            <div className="text-sm font-semibold text-green-600 mt-1">
                              {formatRupiah(contract.profit)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
