import { useState, useEffect, useRef } from "react";
import { Check, ChevronsUpDown, Send, Users, FileText, Calendar, MessageSquare, DollarSign, Hash, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { formatRupiah } from "@/lib/format";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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
  const startIndex = selectedContract ? selectedContract.current_installment_index + 1 : 1;
  const endIndex = startIndex + couponCount - 1;
  const maxCoupons = selectedContract ? selectedContract.tenor_days - selectedContract.current_installment_index : 0;
  const submittedRef = useRef<string | null>(null);

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

  // Reset kontrak jika tidak lagi sesuai filter kolektor
  useEffect(() => {
    if (!collectorId || !contractId) return;
    const c = contracts?.find(x => x.id === contractId);
    if (c && c.collector_id !== collectorId) {
      setContractId("");
      submittedRef.current = null;
    }
  }, [collectorId, contractId, contracts]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!collectorId || !contractId || couponCount < 1) {
      toast.error("Lengkapi semua field yang wajib diisi");
      return;
    }
    if (couponCount > maxCoupons) {
      toast.error(`Maksimal kupon yang bisa diambil: ${maxCoupons}`);
      return;
    }
    await onSubmit({
      collector_id: collectorId,
      contract_id: contractId,
      coupon_count: couponCount,
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

  // AUTO-SAVE: setelah kontrak dipilih (dan kolektor ter-resolve), simpan otomatis.
  useEffect(() => {
    if (!contractId || !collectorId || isSubmitting) return;
    if (submittedRef.current === contractId) return;
    if (!selectedContract || maxCoupons <= 0) return;
    submittedRef.current = contractId;
    void handleSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, collectorId, selectedContract?.id, maxCoupons, isSubmitting]);

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
        <form onSubmit={handleSubmit} className="space-y-6">
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
                  onChange={e => setCouponCount(parseInt(e.target.value) || 1)}
                  className="text-center font-semibold h-12 bg-white dark:bg-gray-900 border-orange-300 dark:border-orange-700"
                />
                {selectedContract && couponCount > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">
                      Kupon {startIndex} - {endIndex}
                    </p>
                    <p className="text-xs font-bold text-orange-600 dark:text-orange-400">
                      Total: {formatRupiah(couponCount * selectedContract.daily_installment_amount)}
                    </p>
                  </div>
                )}
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
                  <Command>
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
                    <p className="font-bold text-blue-800 dark:text-blue-200">{selectedContract.current_installment_index}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">dari {selectedContract.tenor_days}</p>
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

          {/* Status Auto-Save */}
          <div className="flex items-center gap-3 pt-4 text-sm">
            {isSubmitting ? (
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Menyimpan serah terima...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>
                  Isi jumlah kupon terlebih dahulu, lalu pilih kontrak — serah terima akan otomatis tersimpan.
                </span>
              </div>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
