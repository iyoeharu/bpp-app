import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Send, Users, FileText, Calendar, MessageSquare, DollarSign, Hash, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { formatRupiah } from "@/lib/format";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Contract {
  id: string;
  contract_ref: string;
  current_installment_index: number;
  daily_installment_amount: number;
  tenor_days: number;
  collector_id: string | null;
  customers: { name: string } | null;
}

interface Collector {
  id: string;
  collector_code: string;
  name: string;
}

interface Props {
  contracts: Contract[] | undefined;
  collectors: Collector[] | undefined;
  onSubmit: (data: {
    collector_id: string;
    contract_id: string;
    coupon_count: number;
    start_index: number;
    end_index: number;
    handover_date: string;
    notes?: string;
  }) => Promise<void>;
  isSubmitting: boolean;
}

export function HandoverCouponForm({ contracts, collectors, onSubmit, isSubmitting }: Props) {
  const [collectorId, setCollectorId] = useState("");
  const [contractId, setContractId] = useState("");
  const [couponCount, setCouponCount] = useState<number>(1);
  const [handoverDate, setHandoverDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [collectorOpen, setCollectorOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);

  const selectedContract = contracts?.find(c => c.id === contractId);

  const { data: dbProgress, isFetching: isProgressFetching } = useQuery({
    queryKey: ["payment_logs", "contract-progress", contractId],
    queryFn: async () => {
      if (!contractId || !selectedContract) return null;
      const paidIndices: number[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("payment_logs")
          .select("installment_index")
          .eq("contract_id", contractId)
          .order("installment_index", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const row of data) {
          const index = Number(row.installment_index);
          if (Number.isInteger(index) && index >= 1 && index <= selectedContract.tenor_days) {
            paidIndices.push(index);
          }
        }
        if (data.length < pageSize) break;
      }

      // Ambil juga range coupon_handovers agar "kupon yang sudah diserahkan"
      // ikut dihitung — menghindari kasus payment_logs stale/duplikat.
      const { data: handovers, error: hErr } = await supabase
        .from("coupon_handovers")
        .select("start_index,end_index")
        .eq("contract_id", contractId);
      if (hErr) throw hErr;

      const paidSet = new Set(paidIndices);
      const reservedSet = new Set<number>(paidIndices);
      for (const h of handovers ?? []) {
        const s = Number(h.start_index);
        const e = Number(h.end_index);
        if (Number.isInteger(s) && Number.isInteger(e)) {
          for (let i = Math.max(1, s); i <= Math.min(selectedContract.tenor_days, e); i++) {
            reservedSet.add(i);
          }
        }
      }

      let contiguousPaidIndex = 0;
      for (let i = 1; i <= selectedContract.tenor_days; i++) {
        if (paidSet.has(i)) contiguousPaidIndex = i;
        else break;
      }
      // firstFreeIndex = kupon pertama yang belum ada di payment_logs
      // dan belum tercakup coupon_handovers manapun.
      let firstFreeIndex = selectedContract.tenor_days + 1;
      for (let i = 1; i <= selectedContract.tenor_days; i++) {
        if (!reservedSet.has(i)) { firstFreeIndex = i; break; }
      }

      return {
        contiguousPaidIndex,
        firstFreeIndex,
        paidCount: paidSet.size,
        maxPaidIndex: paidIndices.length ? Math.max(...paidIndices) : 0,
        handoverCount: handovers?.length ?? 0,
      };
    },
    enabled: !!contractId && !!selectedContract,
  });

  // Start range wajib mengikuti data aktual (payment_logs + coupon_handovers),
  // bukan cache current_installment_index yang bisa stale.
  const tenor = selectedContract?.tenor_days ?? 0;
  const contractCurrentInstallmentIndex = selectedContract?.current_installment_index ?? 0;
  const autoStartIndex = selectedContract
    ? (dbProgress?.firstFreeIndex ?? contractCurrentInstallmentIndex + 1)
    : 1;
  const currentInstallmentIndex = Math.max(0, autoStartIndex - 1);
  const autoEndIndex = autoStartIndex + couponCount - 1;
  const startIndex = autoStartIndex;
  const endIndex = autoEndIndex;
  const derivedCouponCount = Math.max(0, endIndex - startIndex + 1);
  const maxCoupons = selectedContract ? Math.max(0, tenor - currentInstallmentIndex) : 0;
  const isRangeValid = !!selectedContract && startIndex >= 1 && endIndex >= startIndex && endIndex <= tenor;
  const isProgressReady = !selectedContract || (!!dbProgress && !isProgressFetching);
  const canSubmit = !!collectorId && !!contractId && isProgressReady && derivedCouponCount >= 1 && derivedCouponCount <= maxCoupons && isRangeValid && !isSubmitting;

  // Filter kontrak berdasarkan kolektor yang dipilih (jika ada)
  const filteredContracts = collectorId
    ? contracts?.filter(c => c.collector_id === collectorId)
    : contracts;

  // Auto-fill collector from contract when contract is selected (jika belum diisi)
  useEffect(() => {
    if (!contractId) return;
    const contract = contracts?.find(c => c.id === contractId);
    if (contract?.collector_id && !collectorId) {
      setCollectorId(contract.collector_id);
    }
  }, [contractId, contracts, collectorId]);

  // Jangan menimpa input user. Hanya cap jika melebihi sisa kupon kontrak.
  useEffect(() => {
    if (!selectedContract) return;
    if (maxCoupons > 0 && couponCount > maxCoupons) {
      setCouponCount(maxCoupons);
    }
  }, [selectedContract?.id, maxCoupons, couponCount]);

  // Reset jumlah kupon ke 1 setiap kali kontrak berubah atau
  // current_installment_index berubah (mis. setelah Edit Range Kupon).
  // Ini memastikan form selalu otomatis lanjut ke kupon berikutnya.
  useEffect(() => {
    if (!selectedContract) return;
    setCouponCount(1);
  }, [selectedContract?.id, selectedContract?.current_installment_index]);

  // Reset kontrak jika tidak lagi sesuai filter kolektor
  useEffect(() => {
    if (!collectorId || !contractId) return;
    const c = contracts?.find(x => x.id === contractId);
    if (c && c.collector_id !== collectorId) {
      setContractId("");
    }
  }, [collectorId, contractId, contracts]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!collectorId || !contractId || couponCount < 1) {
      toast.error("Lengkapi semua field yang wajib diisi");
      return;
    }
    if (!isRangeValid) {
      toast.error("Range kupon tidak valid");
      return;
    }
    if (!isProgressReady) {
      toast.error("Range kupon sedang divalidasi dari database");
      return;
    }
    if (derivedCouponCount > maxCoupons) {
      toast.error(`Maksimal kupon yang bisa diambil: ${maxCoupons}`);
      return;
    }
    await onSubmit({
      collector_id: collectorId,
      contract_id: contractId,
      coupon_count: derivedCouponCount,
      start_index: startIndex,
      end_index: endIndex,
      handover_date: handoverDate,
      notes: notes || undefined,
    });
    // Reset
    setContractId("");
    setCouponCount(1);
    setNotes("");
  };
  const handleCouponCountChange = (value: string) => {
    const next = Math.max(1, parseInt(value) || 1);
    setCouponCount(next);
  };

  // Enter untuk submit ketika semua syarat terpenuhi
  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter" && canSubmit) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <Card className="shadow-sm border-0 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 dark:from-blue-950/20 dark:to-indigo-950/20">
      <CardHeader className="pb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center">
              <Send className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl font-semibold text-blue-900 dark:text-blue-100">
                Serah Terima Kupon
              </CardTitle>
              <CardDescription className="text-blue-600/70 dark:text-blue-300/70 mt-1">
                Catat kupon yang diambil kolektor untuk ditagihkan ke konsumen
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="bg-white dark:bg-gray-900 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300">
            Form Serah Terima
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-6">
          {/* STEP 1: Input jumlah kupon, tanggal, catatan terlebih dahulu */}
          <div className="rounded-lg border border-orange-200/60 dark:border-orange-800/40 bg-white/60 dark:bg-gray-900/40 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="outline" className="bg-orange-500 text-white border-orange-500">Langkah 1</Badge>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Tentukan jumlah kupon, tanggal, dan catatan
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <Hash className="h-4 w-4 text-orange-500" />
                  Jumlah Kupon <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={maxCoupons || 999}
                  value={couponCount}
                  onChange={e => handleCouponCountChange(e.target.value)}
                  className="text-center font-semibold h-12 bg-white dark:bg-gray-900 border-orange-300 dark:border-orange-700"
                />
                {/* Real-time range preview tepat di bawah input jumlah kupon */}
                <div className="rounded-md border border-orange-300/60 dark:border-orange-700/60 bg-orange-50/70 dark:bg-orange-950/30 px-3 py-2">
                  {selectedContract ? (
                    !isProgressReady ? (
                      <p className="text-xs text-muted-foreground">Memvalidasi range kupon dari database...</p>
                    ) : derivedCouponCount > 0 ? (
                      <div className="space-y-0.5">
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                          <span className="font-bold text-orange-700 dark:text-orange-300">
                            {startIndex} - {endIndex} = {derivedCouponCount} kupon
                          </span>
                        </p>
                        <p className="text-xs font-bold text-orange-600 dark:text-orange-400">
                          Total: {formatRupiah(derivedCouponCount * selectedContract.daily_installment_amount)}
                        </p>
                        {dbProgress && (
                          <p className="text-[10px] text-muted-foreground">
                            DB: kupon lunas terakhir {dbProgress.maxPaidIndex || 0}, kontigu 1–{dbProgress.contiguousPaidIndex}, {dbProgress.handoverCount} handover. Kupon awal berikutnya: {dbProgress.firstFreeIndex}.
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Masukkan jumlah kupon</p>
                    )
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Range akan muncul setelah kontrak dipilih
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <Calendar className="h-4 w-4 text-purple-500" />
                  Tanggal Serah Terima
                </Label>
                <Input
                  type="date"
                  value={handoverDate}
                  onChange={e => setHandoverDate(e.target.value)}
                  className="h-12 bg-white dark:bg-gray-900 border-purple-300 dark:border-purple-700"
                />
              </div>

              <div className="space-y-3 lg:col-span-2">
                <Label className="text-sm font-semibold flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <MessageSquare className="h-4 w-4 text-indigo-500" />
                  Catatan Tambahan
                </Label>
                <Input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Catatan atau keterangan tambahan (opsional)"
                  className="h-12 bg-white dark:bg-gray-900 border-indigo-300 dark:border-indigo-700"
                />
              </div>
            </div>
          </div>

          <Separator className="my-2" />

          {/* STEP 2: Pilih kontrak (auto-save) */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-green-500 text-white border-green-500">Langkah 2</Badge>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Pilih kontrak — serah terima akan otomatis tersimpan
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Kolektor Section */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <Users className="h-4 w-4 text-blue-500" />
                Pilih Kolektor <span className="text-red-500">*</span>
              </Label>
              <Popover open={collectorOpen} onOpenChange={setCollectorOpen}>
                <PopoverTrigger asChild>
                  <Button 
                    type="button"
                    variant="outline" 
                    role="combobox" 
                    className={cn(
                      "w-full justify-between font-normal h-12 bg-white dark:bg-gray-900",
                      !collectorId && "text-muted-foreground",
                      collectorId && "border-blue-300 dark:border-blue-700"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-500" />
                      {collectorId
                        ? (() => { 
                            const c = collectors?.find(c => c.id === collectorId); 
                            return c ? (
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{c.name}</span>
                                <Badge variant="secondary" className="text-xs">{c.collector_code}</Badge>
                              </div>
                            ) : "Pilih kolektor..."; 
                          })()
                        : "Pilih kolektor..."}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Cari kolektor..." className="h-9" />
                    <CommandList>
                      <CommandEmpty>Tidak ditemukan.</CommandEmpty>
                      <CommandGroup>
                        {collectors?.map(c => (
                          <CommandItem 
                            key={c.id} 
                            value={`${c.name} ${c.collector_code}`} 
                            onSelect={() => { setCollectorId(c.id); setCollectorOpen(false); }}
                            className="flex items-center gap-3 py-3"
                          >
                            <Check className={cn("h-4 w-4", collectorId === c.id ? "opacity-100 text-blue-500" : "opacity-0")} />
                            <Users className="h-4 w-4 text-gray-400" />
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{c.name}</span>
                              <Badge variant="outline" className="text-xs">{c.collector_code}</Badge>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedContract?.collector_id && collectorId === selectedContract.collector_id && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  Otomatis dipilih dari kontrak
                </p>
              )}
            </div>

            {/* Kontrak Section */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <FileText className="h-4 w-4 text-green-500" />
                Pilih Kontrak <span className="text-red-500">*</span>
              </Label>
              <Popover open={contractOpen} onOpenChange={setContractOpen}>
                <PopoverTrigger asChild>
                  <Button 
                    type="button"
                    variant="outline" 
                    role="combobox" 
                    className={cn(
                      "w-full justify-between font-normal h-12 bg-white dark:bg-gray-900",
                      !contractId && "text-muted-foreground",
                      contractId && "border-green-300 dark:border-green-700"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-green-500" />
                      {contractId
                        ? (() => { 
                            const c = selectedContract; 
                            return c ? (
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="font-mono text-xs">{c.contract_ref}</Badge>
                                <span className="font-medium truncate">{c.customers?.name || '-'}</span>
                              </div>
                            ) : "Pilih kontrak..."; 
                          })()
                        : "Pilih kontrak..."}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command filter={(value, search) => {
                    if (!search) return 1;
                    return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                  }}>
                    <CommandInput placeholder="Cari kontrak atau konsumen..." className="h-9" />
                    <CommandList>
                      <CommandEmpty>Tidak ditemukan.</CommandEmpty>
                       <CommandGroup>
                         {filteredContracts?.map(c => (
                          <CommandItem 
                            key={c.id} 
                            value={`${c.contract_ref} ${c.customers?.name || ''}`} 
                            onSelect={() => { setContractId(c.id); setContractOpen(false); }}
                            className="flex items-center gap-3 py-3"
                          >
                            <Check className={cn("h-4 w-4", contractId === c.id ? "opacity-100 text-green-500" : "opacity-0")} />
                            <FileText className="h-4 w-4 text-gray-400" />
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="font-mono text-xs">{c.contract_ref}</Badge>
                                <span className="font-medium">{c.customers?.name || '-'}</span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatRupiah(c.daily_installment_amount)}/kupon • Tenor: {c.tenor_days} hari
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                        {filteredContracts?.length === 0 && collectorId && (
                          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                            Tidak ada kontrak untuk kolektor ini.
                          </div>
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Enhanced Contract Info Display */}
          {selectedContract && (
            <div className="rounded-lg bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950/20 dark:to-blue-950/20 border border-green-200/50 dark:border-green-800/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
                <h4 className="font-semibold text-green-800 dark:text-green-200">Detail Kontrak</h4>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-white/60 dark:bg-gray-800/60 border border-green-200/30">
                  <DollarSign className="h-8 w-8 text-green-500 bg-green-100 dark:bg-green-900/50 rounded-full p-1.5" />
                  <div>
                    <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">Angsuran</p>
                    <p className="font-bold text-green-800 dark:text-green-200">{formatRupiah(selectedContract.daily_installment_amount)}</p>
                    <p className="text-xs text-green-600 dark:text-green-400">per kupon</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-3 rounded-lg bg-white/60 dark:bg-gray-800/60 border border-blue-200/30">
                  <Hash className="h-8 w-8 text-blue-500 bg-blue-100 dark:bg-blue-900/50 rounded-full p-1.5" />
                  <div>
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">Kupon Saat Ini</p>
                    <p className="font-bold text-blue-800 dark:text-blue-200">
                      {isProgressFetching ? "..." : currentInstallmentIndex}
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">dari {selectedContract.tenor_days}</p>
                    {dbProgress && dbProgress.contiguousPaidIndex !== contractCurrentInstallmentIndex && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-300">
                        Disesuaikan dari database
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-3 rounded-lg bg-white/60 dark:bg-gray-800/60 border border-orange-200/30">
                  <FileText className="h-8 w-8 text-orange-500 bg-orange-100 dark:bg-orange-900/50 rounded-full p-1.5" />
                  <div>
                    <p className="text-xs font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wide">Sisa Kupon</p>
                    <p className="font-bold text-orange-800 dark:text-orange-200">{maxCoupons}</p>
                    <p className="text-xs text-orange-600 dark:text-orange-400">kupon tersisa</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-3 rounded-lg bg-white/60 dark:bg-gray-800/60 border border-purple-200/30">
                  <Users className="h-8 w-8 text-purple-500 bg-purple-100 dark:bg-purple-900/50 rounded-full p-1.5" />
                  <div>
                    <p className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide">Konsumen</p>
                    <p className="font-bold text-purple-800 dark:text-purple-200 truncate">{selectedContract.customers?.name || '-'}</p>
                    <Badge variant="outline" className="text-xs mt-1">{selectedContract.contract_ref}</Badge>
                  </div>
                </div>
              </div>
              
              {maxCoupons <= 0 && (
                <div className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  <p className="text-sm font-medium text-red-700 dark:text-red-300">
                    Kontrak ini sudah tidak memiliki kupon tersisa untuk diserahkan.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Tombol Konfirmasi */}
          <div className="flex items-center justify-between gap-3 pt-4">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>
                Pastikan kontrak terpilih & jumlah kupon terisi. Tekan Enter atau klik tombol untuk menyimpan.
              </span>
            </div>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="h-11 px-6 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Simpan Serah Terima
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
