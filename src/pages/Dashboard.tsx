import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMonthlyPerformance, useYearlyTarget } from "@/hooks/useMonthlyPerformance";
import { useYearlyFinancialSummary } from "@/hooks/useYearlyFinancialSummary";
import { useCommissionTiers, calculateTieredCommission } from "@/hooks/useCommissionTiers";
import { useContracts } from '@/hooks/useContracts';
import { useOperationalExpenses, useOperationalExpenseMutations, OperationalExpenseInput } from "@/hooks/useOperationalExpenses";
import { useOperationalExpenseTotals, useOperationalExpenseTotalsYearly } from '@/hooks/useOperationalExpenseTotals';
import { useAgentContractHistory } from "@/hooks/useAgentPerformance";
import { formatRupiah } from "@/lib/format";
import { exportYearlyReportToExcel } from "@/lib/exportYearlyReport";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Users, ChevronRight, ArrowLeft, DollarSign, Target, Wallet, Percent, Calendar, Plus, Trash2, Settings, FileSpreadsheet, BarChart3, CheckCircle, CircleDollarSign, AlertTriangle, Receipt, Ban } from "lucide-react";
import { useAdminNote } from "@/contexts/AdminNoteContext";
import { useReturnedLoss, useReturnedLossYearly } from "@/hooks/useReturnedLoss";
import { useMacetSummary, useMacetSummaryYearly } from "@/hooks/useMacetSummary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, startOfMonth, addMonths, subMonths } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { StatCard } from "@/components/dashboard/StatCard";
import { CollectionTrendChart } from "@/components/dashboard/CollectionTrendChart";
import { ReturnedLossDetailDialog } from "@/components/dashboard/ReturnedLossDetailDialog";
import { OutstandingDetailDialog } from "@/components/dashboard/OutstandingDetailDialog";
import { MacetDetailDialog } from "@/components/dashboard/MacetDetailDialog";
import { OmsetDetailDialog } from "@/components/dashboard/OmsetDetailDialog";
import { useOutstandingDetailsMonthly, useOutstandingDetailsYearly } from "@/hooks/useOutstandingDetails";
import { useOmsetDetailsMonthly, useOmsetDetailsYearly } from "@/hooks/useOmsetDetails";
import { useCollectorSalaryTotal, useCollectorSalaryTotalYearly } from "@/hooks/useCollectorSalaries";
import { useDpTotalMonthly, useDpTotalYearly } from "@/hooks/useDpTotal";
import { toast } from "sonner";

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedYear, setSelectedYear] = useState(new Date());
  const [selectedAgent, setSelectedAgent] = useState<{ id: string; name: string; code: string } | null>(null);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [lossDetailOpen, setLossDetailOpen] = useState(false);
  const [lossDetailScope, setLossDetailScope] = useState<'monthly' | 'yearly'>('monthly');
  const [outstandingDetailOpen, setOutstandingDetailOpen] = useState(false);
  const [outstandingDetailScope, setOutstandingDetailScope] = useState<'monthly' | 'yearly'>('monthly');
  const [macetDetailOpen, setMacetDetailOpen] = useState(false);
  const [macetDetailScope, setMacetDetailScope] = useState<'monthly' | 'yearly'>('monthly');
  const [omsetDetailOpen, setOmsetDetailOpen] = useState(false);
  const [omsetDetailScope, setOmsetDetailScope] = useState<'monthly' | 'yearly'>('monthly');
  const [newExpense, setNewExpense] = useState<OperationalExpenseInput>({
    expense_date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
    amount: 0,
    category: '',
    notes: '',
  });
  
  const { data: monthlyData, isLoading: isLoadingMonthly } = useMonthlyPerformance(selectedMonth);
  const { data: contracts } = useContracts();
  const { data: yearlyData, isLoading: isLoadingYearly } = useYearlyTarget(selectedYear);
  const { data: yearlyFinancial, isLoading: isLoadingYearlyFinancial } = useYearlyFinancialSummary(selectedYear);
  const { data: expenses, isLoading: isLoadingExpenses } = useOperationalExpenses(selectedMonth);
  const { total: opTotal, collectorSalaryTotal: opCollectorSalaryTotal, operationalExclSalaries } = useOperationalExpenseTotals(selectedMonth);
  const { data: historyData, isLoading: isLoadingHistory } = useAgentContractHistory(selectedAgent?.id || null);
  const { data: returnedLoss } = useReturnedLoss(selectedMonth);
  const { data: returnedLossYearly } = useReturnedLossYearly(selectedYear);
  const { data: macetSummary } = useMacetSummary(selectedMonth);
  const { data: macetSummaryYearly } = useMacetSummaryYearly(selectedYear);
  const { data: outstandingMonthly } = useOutstandingDetailsMonthly(selectedMonth);
  const { data: outstandingYearly } = useOutstandingDetailsYearly(selectedYear);
  const { data: omsetMonthly } = useOmsetDetailsMonthly(selectedMonth);
  const { data: omsetYearly } = useOmsetDetailsYearly(selectedYear);
  const { createExpense, deleteExpense } = useOperationalExpenseMutations();
  const collectorSalaryTotal = useCollectorSalaryTotal(selectedMonth);
  const collectorSalaryTotalYearly = useCollectorSalaryTotalYearly(selectedYear);
  const { total: yearlyOpTotal, collectorSalaryTotal: yearlyOpCollectorSalaryTotal, operationalExclSalaries: yearlyOperationalExclSalaries } = useOperationalExpenseTotalsYearly(selectedYear);
  const { data: dpMonthly } = useDpTotalMonthly(selectedMonth);
  const { data: dpYearly } = useDpTotalYearly(selectedYear);
  const { promptAdminNote } = useAdminNote();
  const { data: commissionTiers } = useCommissionTiers();

  // Debug: log if any major hook has error
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[Dashboard] Data status:', {
        monthlyLoading: isLoadingMonthly,
        yearlyLoading: isLoadingYearly,
        yearlyFinancialLoading: isLoadingYearlyFinancial,
        yearlyFinancial: !!yearlyFinancial,
        monthlyData: !!monthlyData,
        contracts: !!contracts?.length,
      });
    }
  }, [isLoadingMonthly, isLoadingYearly, isLoadingYearlyFinancial, yearlyFinancial, monthlyData, contracts]);
  
  // Pagination for sales agent performance table
  const AGENTS_PER_PAGE = 10;
  const agentsList = useMemo(() => monthlyData?.agents || [], [monthlyData?.agents]);
  const { currentPage: agentPage, totalPages: agentTotalPages, paginatedItems: paginatedAgents, goToPage: goToAgentPage, totalItems: agentTotalItems } = usePagination(agentsList, AGENTS_PER_PAGE);

  // Pagination for contract history
  const HISTORY_ITEMS_PER_PAGE = 5;
  const paginatedHistoryData = useMemo(() => historyData || [], [historyData]);
  const { currentPage, totalPages, paginatedItems: paginatedHistory, goToPage, totalItems } = usePagination(paginatedHistoryData, HISTORY_ITEMS_PER_PAGE);

  // Calculate totals with operational expenses
  const totalExpenses = useMemo(() => {
    return expenses?.reduce((sum, exp) => sum + Number(exp.amount), 0) ?? 0;
  }, [expenses]);

  // ===== CONTRACT-BASIS TOTALS (accrual) =====
  // Modal & Omset diakui PENUH untuk kontrak yang dibuat di bulan ini.
  // Sumber: useMonthlyPerformance → langsung dari nilai kontrak.
  const contractTotals = useMemo(() => ({
    total_modal: monthlyData?.total_modal ?? 0,
    total_omset: monthlyData?.total_omset ?? 0,
  }), [monthlyData?.total_modal, monthlyData?.total_omset]);

  // Total uang yang benar-benar tertagih bulan ini (cash inflow apa adanya) — info pelengkap
  const totalCollected = useMemo(
    () => monthlyData?.total_collected ?? 0,
    [monthlyData?.total_collected]
  );

  // Yearly contract totals (contract-basis) for selected year
  const yearlyContractTotals = useMemo(() => {
    if (!contracts) return { total_modal: 0, total_omset: 0 };
    const yearNum = selectedYear.getFullYear();
    let total_modal = 0;
    let total_omset = 0;
    contracts.forEach((c) => {
      if (!c.start_date) return;
      const s = new Date(c.start_date);
      if (s.getFullYear() === yearNum) {
        total_modal += Number(c.omset || 0);
        total_omset += Number(c.total_loan_amount || 0);
      }
    });
    return { total_modal, total_omset };
  }, [contracts, selectedYear]);

  // Calculate total modal & omset based on contracts for the selected YEAR (accrual basis)
  const contractTotalsYearly = useMemo(() => {
    if (!contracts) return { total_modal: 0, total_omset: 0 };
    const yearNum = selectedYear.getFullYear();
    const filtered = contracts.filter(c => {
      if (!c.start_date) return false;
      const d = new Date(c.start_date);
      return d.getFullYear() === yearNum;
    });
    const total_modal = filtered.reduce((s, c) => s + Number(c.omset || 0), 0);
    const total_omset = filtered.reduce((s, c) => s + Number(c.total_loan_amount || 0), 0);
    return { total_modal, total_omset };
  }, [contracts, selectedYear]);

  // Keuntungan Kotor contract-basis: omset_full - modal_full
  const realizedProfit = useMemo(() => monthlyData?.total_profit ?? 0, [monthlyData?.total_profit]);

  // Keuntungan Bersih (net): gross profit dikurangi komisi, biaya operasional (ex. gaji), dan gaji kolektor
  const netProfit = useMemo(() => {
    const profit = monthlyData?.total_profit ?? 0;
    const commission = monthlyData?.total_commission ?? 0;
    const collector = opCollectorSalaryTotal || collectorSalaryTotal || 0;
    const opsExcl = operationalExclSalaries || 0;
    return profit - commission - opsExcl - collector;
  }, [monthlyData?.total_profit, monthlyData?.total_commission, opCollectorSalaryTotal, collectorSalaryTotal, operationalExclSalaries]);

  // Margin keuntungan kotor: (omset - modal) / modal * 100
  const grossProfitMargin = useMemo(() => {
    const modal = monthlyData?.total_modal ?? 0;
    const omset = monthlyData?.total_omset ?? 0;
    if (modal <= 0) return 0;
    return ((omset - modal) / modal) * 100;
  }, [monthlyData?.total_modal, monthlyData?.total_omset]);

  // ===== YEARLY DERIVED VALUES =====
  // Komisi tahunan (12 bulan) — sum dari kolom Komisi halaman Agen Sales (mode tahunan).
  // Dihitung ulang lokal dari tier × omset agen, TANPA bonus tahunan 0.8%.
  // Identik dengan nilai per baris yang ditampilkan di tabel Agen Sales.
  const yearlyCommissionTotal = useMemo(() => {
    const list = yearlyFinancial?.agents;
    if (!Array.isArray(list) || list.length === 0) return 0;
    return list.reduce((sum, a) => {
      const omset = a.total_omset || 0;
      if (omset <= 0) return sum;
      const pct = commissionTiers && commissionTiers.length > 0
        ? calculateTieredCommission(omset, commissionTiers)
        : (a.commission_percentage || 0);
      return sum + (omset * pct) / 100;
    }, 0);
  }, [yearlyFinancial?.agents, commissionTiers]);

  // Margin kotor tahunan: (omset - modal) / modal * 100
  const yearlyGrossProfitMargin = useMemo(() => {
    const modal = yearlyFinancial?.total_modal ?? 0;
    const omset = yearlyFinancial?.total_omset ?? 0;
    if (modal <= 0) return 0;
    return ((omset - modal) / modal) * 100;
  }, [yearlyFinancial?.total_modal, yearlyFinancial?.total_omset]);

  // Keuntungan bersih tahunan: gross profit − komisi 12B − biaya operasional (ex. gaji) − gaji kolektor
  const yearlyNetProfit = useMemo(() => {
    const profit = yearlyFinancial?.total_profit ?? 0;
    const commission = yearlyCommissionTotal;
    const collector = yearlyOpCollectorSalaryTotal || collectorSalaryTotalYearly || 0;
    const opsExcl = yearlyOperationalExclSalaries || 0;
    return profit - commission - opsExcl - collector;
  }, [yearlyFinancial?.total_profit, yearlyCommissionTotal, yearlyOpCollectorSalaryTotal, collectorSalaryTotalYearly, yearlyOperationalExclSalaries]);

  const locale = i18n.language === 'id' ? 'id-ID' : 'en-US';

  // Month navigation
  const handlePrevMonth = () => setSelectedMonth(prev => subMonths(prev, 1));
  const handleNextMonth = () => setSelectedMonth(prev => addMonths(prev, 1));

  // Year options
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  }, []);

  // Handle add expense
  const handleAddExpense = async () => {
    if (!newExpense.description || newExpense.amount <= 0) return;
    await createExpense.mutateAsync(newExpense);
    setNewExpense({
      expense_date: format(new Date(), 'yyyy-MM-dd'),
      description: '',
      amount: 0,
      category: '',
      notes: '',
    });
    setExpenseDialogOpen(false);
  };

  // Handle export to Excel
  const handleExportYearlyReport = async () => {
    if (!yearlyFinancial) {
      toast.error('Data tahunan belum tersedia');
      return;
    }
    try {
      await exportYearlyReportToExcel(yearlyFinancial, selectedYear.getFullYear());
      toast.success('Laporan tahunan berhasil diexport');
    } catch (error) {
      toast.error('Gagal mengexport laporan');
      console.error(error);
    }
  };

  return (
    <>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">{t("dashboard.title")}</h2>
        </div>
        
        {/* Month Selector */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              {format(selectedMonth, 'MMMM yyyy', { locale: idLocale })}
            </span>
          </div>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Monthly Summary Cards - Grid 4 kolom × 2 baris */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          iconColor="text-blue-500"
          label="Total Modal"
          value={contractTotals.total_modal}
          subtitle="Kontrak baru bulan ini"
          hoverInfo="Total modal (harga pokok) dari semua kontrak yang dibuat bulan ini — diakui penuh saat kontrak terbit (accrual)."
        />

        <StatCard
          icon={Wallet}
          iconColor="text-indigo-500"
          label="Total Omset"
          value={contractTotals.total_omset}
          subtitle="Kontrak baru bulan ini"
          hoverInfo="Total omset (harga jual) dari semua kontrak yang dibuat bulan ini — diakui penuh saat kontrak terbit (accrual)."
          onDetailClick={() => { setOmsetDetailScope('monthly'); setOmsetDetailOpen(true); }}
        />

        <StatCard
          icon={Receipt}
          iconColor="text-amber-500"
          label="Total DP"
          value={dpMonthly?.total_dp ?? 0}
          valueColor="text-amber-600"
          subtitle={`${dpMonthly?.contract_count ?? 0} kontrak ada DP`}
          hoverInfo="Total Down Payment (DP) dari kontrak baru bulan ini. Dihitung dari pembayaran pertama setiap kontrak yang dibuat bulan ini."
        />

        <StatCard
          icon={TrendingUp}
          iconColor="text-green-500"
          label="Keuntungan Kotor"
          value={realizedProfit}
          valueColor="text-green-600"
          subtitle="Omset − Modal"
          hoverInfo="Keuntungan kotor dari kontrak-kontrak baru bulan ini, sebelum dikurangi komisi & operasional."
        />

        <StatCard
          icon={CircleDollarSign}
          iconColor="text-emerald-500"
          label="Margin Kotor"
          value={grossProfitMargin}
          isPercentage
          valueColor={grossProfitMargin >= 0 ? 'text-green-600' : 'text-destructive'}
          subtitle="(Omset − Modal) / Modal"
          hoverInfo="Persentase markup dari modal. Mis: 25% berarti tiap Rp 100 modal hasilkan Rp 25 keuntungan kotor."
        />

        <StatCard
          icon={Percent}
          iconColor="text-purple-500"
          label="Total Komisi"
          value={monthlyData?.total_commission ?? 0}
          valueColor="text-purple-600"
          subtitle="Semua sales bulan ini"
          hoverInfo="Total komisi seluruh sales agent, dihitung dari nilai kontrak baru bulan ini × tier komisi masing-masing."
        />

        <StatCard
          icon={CheckCircle}
          iconColor="text-teal-500"
          label="Tertagih"
          value={totalCollected}
          valueColor="text-teal-600"
          subtitle="Pembayaran masuk bulan ini"
          hoverInfo="Total uang yang benar-benar tertagih (cash inflow) dari pembayaran yang masuk bulan ini, lintas semua kontrak."
        />

        <StatCard
          icon={Wallet}
          iconColor="text-red-500"
          label="Sisa Tagihan"
          value={monthlyData?.total_to_collect ?? 0}
          valueColor="text-red-600"
          subtitle="Kontrak baru bulan ini"
          hoverInfo={`Sisa tagihan dari kontrak yang dibuat bulan ini.\nRumus per kontrak: Total Nilai Kontrak (total_loan_amount) − Total Pembayaran (ALL TIME).\nSinkron dengan rumus tahunan.\n\nKlik Detail untuk lihat per sales & per kontrak.`}
          onDetailClick={() => { setOutstandingDetailScope('monthly'); setOutstandingDetailOpen(true); }}
        />

        <StatCard
          icon={Settings}
          iconColor="text-orange-500"
          label="Biaya Operasional (ex. Gaji)"
          value={operationalExclSalaries}
          valueColor="text-orange-600"
          isNegative
          subtitle="Pengeluaran bulan ini (tidak termasuk gaji kolektor)"
          hoverInfo="Total biaya operasional selain gaji kolektor (transport, komunikasi, dll)."
        />

        <StatCard
          icon={Users}
          iconColor="text-cyan-500"
          label="Gaji Kolektor"
          value={opCollectorSalaryTotal}
          valueColor="text-cyan-600"
          isNegative
          subtitle="Total gaji bulan ini"
          hoverInfo="Total gaji semua kolektor pada bulan ini (dipisahkan dari biaya operasional)."
        />

        <StatCard
          icon={AlertTriangle}
          iconColor="text-destructive"
          label="Kerugian (Return)"
          value={returnedLoss?.total_loss ?? 0}
          valueColor="text-destructive"
          isNegative
          subtitle={`${returnedLoss?.returned_count ?? 0} kontrak return bulan ini`}
          hoverInfo={`Kerugian dari kontrak yang di-return (dihapus permanen) di bulan ini.\nModal hilang: ${formatRupiah(returnedLoss?.total_modal_loss ?? 0)}\nSempat tertagih: ${formatRupiah(returnedLoss?.total_collected_back ?? 0)}\nKerugian bersih = Modal − Tertagih.\n\nKlik Detail untuk melihat per sales & kontrak.`}
          onDetailClick={() => { setLossDetailScope('monthly'); setLossDetailOpen(true); }}
        />

        <StatCard
          icon={Ban}
          iconColor="text-rose-500"
          label="Macet"
          value={macetSummary?.total_outstanding ?? 0}
          valueColor="text-rose-600"
          isNegative
          subtitle={`${macetSummary?.macet_count ?? 0} kontrak macet bulan ini`}
          hoverInfo={`Kontrak aktif berstatus MACET (telat pembayaran parah) dari kontrak yang dibuat bulan ini.\nJumlah kontrak: ${macetSummary?.macet_count ?? 0}\nModal nyangkut: ${formatRupiah(macetSummary?.total_modal_at_risk ?? 0)}\nSisa tagihan macet: ${formatRupiah(macetSummary?.total_outstanding ?? 0)}`}
          onDetailClick={() => { setMacetDetailScope('monthly'); setMacetDetailOpen(true); }}
        />
      </div>

      {/* Net Profit Card */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Keuntungan Bersih</p>
              <p className={`text-3xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                {formatRupiah(netProfit)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground mb-1">Periode</p>
              <p className="font-medium">{format(selectedMonth, 'MMMM yyyy', { locale: idLocale })}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Collection Trend Chart Component */}
      <CollectionTrendChart />

      {/* Operational Expenses Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-orange-500" />
              <CardTitle>Biaya Operasional - {format(selectedMonth, 'MMMM yyyy', { locale: idLocale })}</CardTitle>
            </div>
            <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Tambah
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Tambah Biaya Operasional</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Tanggal</label>
                    <Input
                      type="date"
                      value={newExpense.expense_date}
                      onChange={(e) => setNewExpense({ ...newExpense, expense_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Deskripsi</label>
                    <Input
                      placeholder="Contoh: Bensin, Pulsa, dll"
                      value={newExpense.description}
                      onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Kategori (Opsional)</label>
                    <Input
                      placeholder="Contoh: Transport, Komunikasi"
                      value={newExpense.category || ''}
                      onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Jumlah</label>
                    <CurrencyInput
                      placeholder="Rp 0"
                      value={newExpense.amount || 0}
                      onValueChange={(val) => setNewExpense({ ...newExpense, amount: val || 0 })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Catatan (Opsional)</label>
                    <Textarea
                      placeholder="Catatan tambahan..."
                      value={newExpense.notes || ''}
                      onChange={(e) => setNewExpense({ ...newExpense, notes: e.target.value })}
                    />
                  </div>
                  <Button onClick={handleAddExpense} disabled={createExpense.isPending} className="w-full">
                    {createExpense.isPending ? 'Menyimpan...' : 'Simpan'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingExpenses ? (
            <Skeleton className="h-[150px] w-full" />
          ) : expenses && expenses.length > 0 ? (
            <div className="grid grid-cols-1 gap-4">
              {/* Left: Expenses table (full width) */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Deskripsi</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead>Catatan</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>
                          {new Date(expense.expense_date).toLocaleDateString(locale, {
                            day: 'numeric',
                            month: 'short'
                          })}
                        </TableCell>
                        <TableCell className="font-medium">{expense.description}</TableCell>
                        <TableCell className="text-muted-foreground">{expense.category || '-'}</TableCell>
                        <TableCell className="text-right text-orange-600 font-medium">
                          {formatRupiah(expense.amount)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[150px] truncate">
                          {expense.notes || '-'}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={async () => {
                              const note = await promptAdminNote({
                                title: "Catatan Hapus Biaya Operasional",
                                description: `Tuliskan alasan menghapus "${expense.description}".`,
                                confirmLabel: "Hapus",
                                variant: "destructive",
                              });
                              if (!note) return;
                              deleteExpense.mutate({ id: expense.id, _note: note });
                            }}
                            disabled={deleteExpense.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Keuntungan Akhir summary removed from operational container as requested */}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Belum ada biaya operasional bulan ini
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sales Agent Performance Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle>{t("dashboard.salesPerformance", "Performa Sales")} - {format(selectedMonth, 'MMMM yyyy', { locale: idLocale })}</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("dashboard.clickToViewHistory", "Klik untuk melihat kontrak yang didapat")}
          </p>
        </CardHeader>
        <CardContent>
          {isLoadingMonthly ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">#</TableHead>
                      <TableHead>{t("dashboard.agentCode", "Kode Sales")}</TableHead>
                      <TableHead className="text-right">{t("dashboard.modal", "Modal")}</TableHead>
                      <TableHead className="text-right">{t("dashboard.omset", "Omset")}</TableHead>
                      <TableHead className="text-right">{t("dashboard.profit", "Keuntungan")}</TableHead>
                      <TableHead className="text-right">{t("dashboard.profitMargin", "Margin %")}</TableHead>
                      <TableHead className="text-right">{t("dashboard.commission", "Komisi")}</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedAgents.map((agent, index) => (
                      <TableRow 
                        key={agent.agent_id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedAgent({ id: agent.agent_id, name: agent.agent_name, code: agent.agent_code })}
                      >
                        <TableCell className="font-medium">{(agentPage - 1) * AGENTS_PER_PAGE + index + 1}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{agent.agent_code}</p>
                            <p className="text-xs text-muted-foreground">{agent.agent_name} • {agent.commission_percentage}%</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-blue-600">{formatRupiah(agent.total_modal)}</TableCell>
                        <TableCell className="text-right">{formatRupiah(agent.total_omset)}</TableCell>
                        <TableCell className="text-right text-green-600">{formatRupiah(agent.profit)}</TableCell>
                        <TableCell className="text-right text-emerald-600">{agent.profit_margin.toFixed(1)}%</TableCell>
                        <TableCell className="text-right text-purple-600">{formatRupiah(agent.total_commission)}</TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))}
                    {paginatedAgents.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          {t("dashboard.noAgentData", "Belum ada data sales agent bulan ini")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <TablePagination
                currentPage={agentPage}
                totalPages={agentTotalPages}
                onPageChange={goToAgentPage}
                totalItems={agentTotalItems}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Yearly Financial Summary Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-500" />
              <CardTitle>Kalkulasi Keuangan Tahunan</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={selectedYear.getFullYear().toString()}
                onValueChange={(val) => setSelectedYear(new Date(parseInt(val), 0, 1))}
              >
                <SelectTrigger className="w-[140px] bg-background">
                  <Calendar className="h-4 w-4 text-muted-foreground mr-2" />
                  <SelectValue placeholder="Pilih Tahun" />
                </SelectTrigger>
                <SelectContent className="bg-popover border shadow-md">
                  {yearOptions.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      <span className="font-medium">{year}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleExportYearlyReport}
                disabled={isLoadingYearlyFinancial || !yearlyFinancial}
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export Excel
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoadingYearlyFinancial ? (
            <Skeleton className="h-[400px] w-full" />
          ) : (
            <>
              {/* Summary Cards - Using StatCard like monthly (responsive 4 columns => 2 rows on wide screens) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  icon={DollarSign}
                  iconColor="text-blue-500"
                  label="Total Modal"
                  value={contractTotalsYearly.total_modal}
                  subtitle={`Tahun ${selectedYear.getFullYear()}`}
                  hoverInfo={`Total: ${formatRupiah(yearlyFinancial?.total_modal ?? 0)} | ${yearlyFinancial?.contracts_count ?? 0} kontrak • Lancar: ${yearlyFinancial?.lancar_count ?? 0} | K.Lancar: ${yearlyFinancial?.kurang_lancar_count ?? 0} | Macet: ${yearlyFinancial?.macet_count ?? 0} | Lunas: ${yearlyFinancial?.completed_count ?? 0}`}
                />
                
                <StatCard
                  icon={Wallet}
                  iconColor="text-indigo-500"
                  label="Total Omset"
                  value={contractTotalsYearly.total_omset}
                  subtitle={`Tahun ${selectedYear.getFullYear()}`}
                  hoverInfo={`Total: ${formatRupiah(yearlyFinancial?.total_omset ?? 0)} | ${yearlyFinancial?.contracts_count ?? 0} kontrak • Lancar: ${yearlyFinancial?.lancar_count ?? 0} | K.Lancar: ${yearlyFinancial?.kurang_lancar_count ?? 0} | Macet: ${yearlyFinancial?.macet_count ?? 0} | Lunas: ${yearlyFinancial?.completed_count ?? 0}`}
                  onDetailClick={() => { setOmsetDetailScope('yearly'); setOmsetDetailOpen(true); }}
                />

                <StatCard
                  icon={Receipt}
                  iconColor="text-amber-500"
                  label="Total DP"
                  value={dpYearly?.total_dp ?? 0}
                  valueColor="text-amber-600"
                  subtitle={`${dpYearly?.contract_count ?? 0} kontrak ada DP`}
                  hoverInfo={`Total Down Payment (DP) dari kontrak yang dibuat tahun ${selectedYear.getFullYear()}. Dihitung dari pembayaran pertama setiap kontrak.`}
                />

                <StatCard
                  icon={TrendingUp}
                  iconColor="text-green-500"
                  label="Keuntungan Kotor"
                  value={yearlyFinancial?.total_profit ?? 0}
                  valueColor="text-green-600"
                  subtitle={`Tahun ${selectedYear.getFullYear()}`}
                  hoverInfo={`Total: ${formatRupiah(yearlyFinancial?.total_profit ?? 0)} | Margin: ${yearlyFinancial?.profit_margin?.toFixed(1) ?? 0}%`}
                />

                <StatCard
                  icon={CircleDollarSign}
                  iconColor="text-emerald-500"
                  label="Margin Kotor"
                  value={yearlyGrossProfitMargin}
                  isPercentage
                  valueColor={yearlyGrossProfitMargin >= 0 ? 'text-green-600' : 'text-destructive'}
                  subtitle="(Omset − Modal) / Modal"
                  hoverInfo="Persentase markup tahunan dari modal."
                />

                <StatCard
                  icon={Percent}
                  iconColor="text-purple-500"
                  label="Komisi 12B"
                  value={yearlyCommissionTotal}
                  valueColor="text-purple-600"
                  subtitle={`Total komisi 12 bulan (${selectedYear.getFullYear()})`}
                  hoverInfo={`Total komisi tahun ${selectedYear.getFullYear()} — sumber: halaman Agen Sales (mode tahunan). Sum dari kolom Komisi setiap sales agent.`}
                />

                <StatCard
                  icon={CheckCircle}
                  iconColor="text-teal-500"
                  label="Tertagih"
                  value={yearlyFinancial?.total_collected ?? 0}
                  valueColor="text-teal-600"
                  subtitle={`Pembayaran masuk tahun ${selectedYear.getFullYear()}`}
                  hoverInfo={`Total uang yang benar-benar tertagih (cash inflow) sepanjang tahun ${selectedYear.getFullYear()}.`}
                />

                <StatCard
                  icon={Wallet}
                  iconColor="text-red-500"
                  label="Sisa Tagihan"
                  value={yearlyFinancial?.total_to_collect ?? 0}
                  valueColor="text-red-600"
                  subtitle={`Tahun ${selectedYear.getFullYear()}`}
                  hoverInfo={`Sisa tagihan per kontrak tahun ini: Total Kontrak − Total Pembayaran (ALL TIME). Total sisa: ${formatRupiah(yearlyFinancial?.total_to_collect ?? 0)}\n\nKlik Detail untuk lihat per sales & per kontrak.`}
                  onDetailClick={() => { setOutstandingDetailScope('yearly'); setOutstandingDetailOpen(true); }}
                />

                <StatCard
                  icon={Settings}
                  iconColor="text-orange-500"
                  label="Biaya Operasional (ex. Gaji)"
                  value={yearlyOperationalExclSalaries}
                  valueColor="text-orange-600"
                  isNegative
                  subtitle={`Tahun ${selectedYear.getFullYear()}`}
                  hoverInfo={`Total biaya operasional tahun ${selectedYear.getFullYear()} (tidak termasuk gaji kolektor).`}
                />

                <StatCard
                  icon={Users}
                  iconColor="text-cyan-500"
                  label="Gaji Kolektor"
                  value={yearlyOpCollectorSalaryTotal}
                  valueColor="text-cyan-600"
                  isNegative
                  subtitle={`Total gaji tahun ${selectedYear.getFullYear()}`}
                  hoverInfo="Total gaji semua kolektor sepanjang tahun (dipisahkan dari biaya operasional)."
                />

                <StatCard
                  icon={AlertTriangle}
                  iconColor="text-destructive"
                  label="Kerugian (Return)"
                  value={returnedLossYearly?.total_loss ?? 0}
                  valueColor="text-destructive"
                  isNegative
                  subtitle={`${returnedLossYearly?.returned_count ?? 0} kontrak return tahun ${selectedYear.getFullYear()}`}
                  hoverInfo={`Kerugian dari kontrak yang di-return (dihapus permanen) sepanjang tahun ${selectedYear.getFullYear()}.\nModal hilang: ${formatRupiah(returnedLossYearly?.total_modal_loss ?? 0)}\nSempat tertagih: ${formatRupiah(returnedLossYearly?.total_collected_back ?? 0)}\nKerugian bersih = Modal − Tertagih.\n\nKlik Detail untuk melihat per sales & kontrak.`}
                  onDetailClick={() => { setLossDetailScope('yearly'); setLossDetailOpen(true); }}
                />

                <StatCard
                  icon={Ban}
                  iconColor="text-rose-500"
                  label="Macet"
                  value={macetSummaryYearly?.total_outstanding ?? 0}
                  valueColor="text-rose-600"
                  isNegative
                  subtitle={`${macetSummaryYearly?.macet_count ?? 0} kontrak macet tahun ${selectedYear.getFullYear()}`}
                  hoverInfo={`Kontrak aktif berstatus MACET (telat pembayaran parah) dari kontrak yang dibuat tahun ${selectedYear.getFullYear()}.\nJumlah kontrak: ${macetSummaryYearly?.macet_count ?? 0}\nModal nyangkut: ${formatRupiah(macetSummaryYearly?.total_modal_at_risk ?? 0)}\nSisa tagihan macet: ${formatRupiah(macetSummaryYearly?.total_outstanding ?? 0)}`}
                  onDetailClick={() => { setMacetDetailScope('yearly'); setMacetDetailOpen(true); }}
                />

              </div>

              {/* Yearly Net Profit Card */}
              <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Keuntungan Bersih Tahunan</p>
                      <p className={`text-3xl font-bold ${yearlyNetProfit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                        {formatRupiah(yearlyNetProfit)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Keuntungan Kotor − Komisi 12B (sum real bulanan) − Biaya Operasional − Gaji Kolektor
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground mb-1">Periode</p>
                      <p className="font-medium">Tahun {selectedYear.getFullYear()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Monthly Breakdown Chart */}
              <div>
                <h4 className="text-sm font-medium mb-3">Breakdown Bulanan</h4>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={yearlyFinancial?.monthly_breakdown || []}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="monthLabel" className="text-xs" />
                      <YAxis tickFormatter={(v) => `${(v / 1000000).toFixed(0)}M`} className="text-xs" />
                      <Tooltip
                        formatter={(value: number, name: string) => {
                          const labels: Record<string, string> = {
                            total_modal: 'Modal',
                            total_omset: 'Omset',
                            profit: 'Keuntungan',
                            collected: 'Tertagih',
                          };
                          return [formatRupiah(value), labels[name] || name];
                        }}
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))", 
                          border: "1px solid hsl(var(--border))" 
                        }}
                      />
                      <Bar dataKey="total_modal" fill="hsl(217, 91%, 60%)" name="total_modal" />
                      <Bar dataKey="total_omset" fill="hsl(239, 84%, 67%)" name="total_omset" />
                      <Bar dataKey="profit" fill="hsl(142, 76%, 36%)" name="profit" />
                      <Bar dataKey="collected" fill="hsl(168, 84%, 38%)" name="collected" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Collection Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Jumlah Kontrak</p>
                  <p className="text-xl font-bold">{yearlyFinancial?.contracts_count ?? 0}</p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Sudah Tertagih</p>
                  <p className="text-xl font-bold text-green-600">{formatRupiah(yearlyFinancial?.total_collected ?? 0)}</p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Sisa Tagihan</p>
                  <p className="text-xl font-bold text-orange-600">{formatRupiah(yearlyFinancial?.total_to_collect ?? 0)}</p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Tingkat Penagihan</p>
                  <p className="text-xl font-bold text-blue-600">{(yearlyFinancial?.collection_rate ?? 0).toFixed(1)}%</p>
                </div>
              </div>

              {/* Agent Performance Table */}
              {yearlyFinancial?.agents && yearlyFinancial.agents.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="h-5 w-5 text-primary" />
                    <h4 className="text-sm font-medium">Performa Sales Tahunan</h4>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Klik untuk melihat kontrak yang didapat
                  </p>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50px]">#</TableHead>
                          <TableHead>Kode Sales</TableHead>
                          <TableHead className="text-right">Modal</TableHead>
                          <TableHead className="text-right">Omset</TableHead>
                          <TableHead className="text-right">Keuntungan</TableHead>
                          <TableHead className="text-right">Margin %</TableHead>
                          <TableHead className="text-right">Komisi</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {yearlyFinancial.agents.map((agent, index) => {
                          // Margin = (Omset − Modal) / Modal × 100  — konsisten dengan tab bulanan
                          const profitMargin = agent.total_modal > 0 
                            ? ((agent.profit / agent.total_modal) * 100) 
                            : 0;
                          // Komisi tahunan = total komisi dari tier komisi berdasarkan omset agen
                          const yearlyAgentCommission = agent.total_commission || 0;
                          return (
                            <TableRow 
                              key={agent.agent_id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => setSelectedAgent({ 
                                id: agent.agent_id, 
                                name: agent.agent_name, 
                                code: agent.agent_code 
                              })}
                            >
                              <TableCell className="font-medium">{index + 1}</TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{agent.agent_code}</p>
                                  <p className="text-xs text-muted-foreground">{agent.agent_name} • {agent.contracts_count} kontrak • {agent.commission_percentage?.toFixed(1) || 0}%</p>
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-blue-600">{formatRupiah(agent.total_modal)}</TableCell>
                              <TableCell className="text-right">{formatRupiah(agent.total_omset)}</TableCell>
                              <TableCell className="text-right text-green-600">{formatRupiah(agent.profit)}</TableCell>
                              <TableCell className="text-right text-emerald-600">{profitMargin.toFixed(1)}%</TableCell>
                              <TableCell className="text-right text-purple-600">{formatRupiah(yearlyAgentCommission)}</TableCell>
                              <TableCell>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Agent Contract History Dialog */}
      <Dialog open={!!selectedAgent} onOpenChange={() => setSelectedAgent(null)}>
        <DialogContent className="max-w-5xl w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setSelectedAgent(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              {t("dashboard.contractHistory", "Kontrak Didapat")} - {selectedAgent?.code} ({selectedAgent?.name})
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {isLoadingHistory ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("dashboard.startDate", "Tanggal Mulai")}</TableHead>
                      <TableHead>{t("dashboard.contract", "Kontrak")}</TableHead>
                      <TableHead>{t("dashboard.product", "Produk")}</TableHead>
                      <TableHead className="text-right">{t("dashboard.modal", "Modal")}</TableHead>
                      <TableHead className="text-right">{t("dashboard.omset", "Omset")}</TableHead>
                      <TableHead className="text-right">{t("dashboard.profit", "Keuntungan")}</TableHead>
                      <TableHead className="text-center">{t("dashboard.status", "Status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedHistory?.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {new Date(item.start_date).toLocaleDateString(locale, {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-mono text-sm">{item.contract_ref}</p>
                              {item.is_new_contract && (
                                <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">Kontrak Baru</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-muted-foreground">{item.customer_name}</p>
                              {item.is_new_customer && (
                                <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">Pelanggan Baru</span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{item.product_type || '-'}</TableCell>
                        <TableCell className="text-right text-blue-600">{formatRupiah(item.modal)}</TableCell>
                        <TableCell className="text-right font-medium">{formatRupiah(item.omset)}</TableCell>
                        <TableCell className="text-right text-green-600 font-medium">{formatRupiah(item.profit)}</TableCell>
                        <TableCell className="text-center">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            item.status === 'active' ? 'bg-green-100 text-green-700' : 
                            item.status === 'completed' ? 'bg-blue-100 text-blue-700' : 
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {item.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!paginatedHistory || paginatedHistory.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          {t("dashboard.noData", "Tidak ada data kontrak")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>

                {totalItems > HISTORY_ITEMS_PER_PAGE && (
                  <div className="mt-4">
                    <TablePagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={goToPage}
                      totalItems={totalItems}
                    />
                  </div>
                )}
              </>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>

    <ReturnedLossDetailDialog
      open={lossDetailOpen}
      onOpenChange={setLossDetailOpen}
      title={lossDetailScope === 'monthly'
        ? `Detail Kerugian — ${format(selectedMonth, 'MMMM yyyy', { locale: idLocale })}`
        : `Detail Kerugian — Tahun ${selectedYear.getFullYear()}`}
      data={lossDetailScope === 'monthly' ? returnedLoss : returnedLossYearly}
    />

    <OutstandingDetailDialog
      open={outstandingDetailOpen}
      onOpenChange={setOutstandingDetailOpen}
      title={outstandingDetailScope === 'monthly'
        ? `Detail Sisa Tagihan — ${format(selectedMonth, 'MMMM yyyy', { locale: idLocale })}`
        : `Detail Sisa Tagihan — Tahun ${selectedYear.getFullYear()}`}
      data={outstandingDetailScope === 'monthly' ? outstandingMonthly : outstandingYearly}
    />

    <MacetDetailDialog
      open={macetDetailOpen}
      onOpenChange={setMacetDetailOpen}
      title={macetDetailScope === 'monthly'
        ? `Detail Macet — ${format(selectedMonth, 'MMMM yyyy', { locale: idLocale })}`
        : `Detail Macet — Tahun ${selectedYear.getFullYear()}`}
      data={macetDetailScope === 'monthly' ? macetSummary : macetSummaryYearly}
    />

    <OmsetDetailDialog
      open={omsetDetailOpen}
      onOpenChange={setOmsetDetailOpen}
      title={omsetDetailScope === 'monthly'
        ? `Detail Omset — ${format(selectedMonth, 'MMMM yyyy', { locale: idLocale })}`
        : `Detail Omset — Tahun ${selectedYear.getFullYear()}`}
      data={omsetDetailScope === 'monthly' ? omsetMonthly : omsetYearly}
    />
    </>
  );
}
