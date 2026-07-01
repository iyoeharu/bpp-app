import { useState, useEffect } from "react";
import { CreditCard, AlertTriangle, CheckCircle2, Info, Check, ChevronsUpDown, Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { formatRupiah } from "@/lib/format";
import { useLastPaymentDate, useNextCouponDueDate, calculateLateNoteFromDueDate } from "@/hooks/useLastPaymentDate";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Contract {
  id: string;
  contract_ref: string;
  current_installment_index: number;
  daily_installment_amount: number;
  total_loan_amount: number;
  tenor_days: number;
  collector_id: string | null;
  customers: { name: string } | null;
}

interface Collector {
  id: string;
  collector_code: string;
  name: string;
}

interface PaymentFormProps {
  contracts: Contract[] | undefined;
  collectors: Collector[] | undefined;
  onSubmit: (data: {
    contract_id: string;
    payment_date: string;
    installment_index: number;
    amount_paid: number;
    collector_id: string | null;
    notes: string;
  }) => Promise<void>;
  onBulkSubmit: (data: {
    contract_id: string;
    payment_date: string;
    start_index: number;
    coupon_count: number;
    amount_per_coupon: number;
    collector_id: string | null;
    notes: string;
  }) => Promise<void>;
  isSubmitting: boolean;
  selectedContractId?: string;
  setSelectedContractId?: (id: string) => void;
}

export function PaymentForm({ contracts, collectors, onSubmit, onBulkSubmit, isSubmitting, selectedContractId, setSelectedContractId }: PaymentFormProps) {
  const { t } = useTranslation();

  // selectedContract is optionally provided by parent (Collection) so the dropdown can be replaced
  const [internalSelectedContract, setInternalSelectedContract] = useState("");
  const [contractOpen, setContractOpen] = useState(false);
  const activeSelected = selectedContractId || internalSelectedContract;
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentAmount, setPaymentAmount] = useState<number | undefined>(undefined);
  const [paymentCollector, setPaymentCollector] = useState("");
  const [collectorOpen, setCollectorOpen] = useState(false);
  const [paymentNotes, setPaymentNotes] = useState("");
  const [couponCount, setCouponCount] = useState(1);

  const selectedContractData = contracts?.find((c) => c.id === activeSelected);
  const nextCoupon = selectedContractData ? selectedContractData.current_installment_index + 1 : 1;
  const remainingCoupons = selectedContractData ? selectedContractData.tenor_days - selectedContractData.current_installment_index : 0;
  const maxCoupons = Math.min(remainingCoupons, 100); // Limit to remaining coupons

  const { data: lastPaymentDate } = useLastPaymentDate(activeSelected || null);
  const { data: nextCouponDueDate } = useNextCouponDueDate(activeSelected || null, nextCoupon);

  const [lateInfo, setLateInfo] = useState<{
    isLate: boolean;
    lateDays: number;
    note: string | null;
    dueDate: string | null;
  }>({ isLate: false, lateDays: 0, note: null, dueDate: null });

  // Calculate totals for bulk payment
  const isBulkPayment = couponCount > 1;
  const endCoupon = nextCoupon + couponCount - 1;
  const rangeCouponLabel = `${nextCoupon} - ${endCoupon} = ${couponCount} kupon`;
  const totalBulkAmount = selectedContractData 
    ? (paymentAmount || selectedContractData.daily_installment_amount) * couponCount 
    : 0;

  // Auto-fill collector from contract when contract is selected
  useEffect(() => {
    if (!activeSelected) {
      setPaymentCollector("");
      return;
    }
    // Use collector assigned to the contract directly
    const contract = contracts?.find(c => c.id === activeSelected);
    if (contract?.collector_id) {
      setPaymentCollector(contract.collector_id);
    } else {
      // Fallback: try to get from latest coupon_handovers if no collector in contract
      const fetchHandoverCollector = async () => {
        const { data } = await supabase
          .from('coupon_handovers')
          .select('collector_id')
          .eq('contract_id', activeSelected)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (data?.collector_id) {
          setPaymentCollector(data.collector_id);
        }
      };
      fetchHandoverCollector();
    }
  }, [selectedContractId, internalSelectedContract, contracts]);

  useEffect(() => {
    if (activeSelected && nextCouponDueDate && paymentDate) {
      const info = calculateLateNoteFromDueDate(nextCouponDueDate, paymentDate);
      setLateInfo(info);
      if (info.isLate && info.note && !paymentNotes) {
        setPaymentNotes(info.note);
      }
    } else {
      setLateInfo({ isLate: false, lateDays: 0, note: null, dueDate: null });
    }
  }, [selectedContractId, internalSelectedContract, nextCouponDueDate, paymentDate]);

  const handleAmountChange = (value: number | undefined) => {
    setPaymentAmount(value);
  };

  const getNumericAmount = () => {
    return paymentAmount || 0;
  };

  const handleSubmit = async () => {
    const activeSelected = selectedContractId || internalSelectedContract;
    if (!activeSelected) {
      toast.error(t("errors.selectContract"));
      return;
    }

    const amount = getNumericAmount() || selectedContractData?.daily_installment_amount || 0;

    try {
  if (isBulkPayment) {
  // Bulk payment
  const defaultNote = `Kupon yang dibayar adalah ${nextCoupon} - ${endCoupon}`;
  const finalNotes = paymentNotes.trim() || defaultNote;

        await onBulkSubmit({
          contract_id: activeSelected,
          payment_date: paymentDate,
          start_index: nextCoupon,
          coupon_count: couponCount,
          amount_per_coupon: amount,
          collector_id: paymentCollector || null,
          notes: finalNotes,
        });
      } else {
        // Single payment
        const defaultNote = `Pembayaran ke-${nextCoupon}`;
        const finalNotes = paymentNotes.trim() || defaultNote;

        await onSubmit({
          contract_id: activeSelected,
          payment_date: paymentDate,
          installment_index: nextCoupon,
          amount_paid: amount,
          collector_id: paymentCollector || null,
          notes: finalNotes,
        });
      }

      // Reset form (reset parent-selected if provided)
      if (setSelectedContractId) setSelectedContractId("");
      setInternalSelectedContract("");
      setPaymentAmount(undefined);
      setPaymentNotes("");
      setPaymentCollector("");
      setCouponCount(1);
    } catch {
      // Error handled by parent
    }
  };

  const progress = selectedContractData
    ? (selectedContractData.current_installment_index / selectedContractData.tenor_days) * 100
    : 0;

  return (
    <Card className="print:hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          {t("collection.recordPayment")}
        </CardTitle>
        <CardDescription>{t("collection.recordPaymentDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Contract Selection */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("collection.selectContract")}</Label>
            <Popover open={contractOpen} onOpenChange={setContractOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={contractOpen}
                  className="w-full justify-between font-normal"
                >
                  {activeSelected
                    ? (() => {
                        const contract = contracts?.find((c) => c.id === activeSelected);
                        return contract ? `${contract.contract_ref} - ${contract.customers?.name}` : t("collection.chooseContract");
                      })()
                    : t("collection.chooseContract")}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Cari kontrak atau nama pelanggan..." />
                  <CommandList>
                    <CommandEmpty>Kontrak tidak ditemukan.</CommandEmpty>
                    <CommandGroup>
                      {contracts?.map((contract) => (
                        <CommandItem
                          key={contract.id}
                          value={`${contract.contract_ref} ${contract.customers?.name || ''}`}
                          onSelect={() => {
                            if (setSelectedContractId) setSelectedContractId(contract.id);
                            else setInternalSelectedContract(contract.id);
                            setContractOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              activeSelected === contract.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="font-mono">{contract.contract_ref}</span>
                          <span className="text-muted-foreground ml-2">- {contract.customers?.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("collection.paymentDate")}</Label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>
        </div>

        {/* Contract Details */}
        {selectedContractData && (
          <>
            <Separator />
            <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">{t("collection.contractDetails")}</h4>
                <Badge variant="outline" className="text-lg font-bold px-3 py-1">
                  {rangeCouponLabel}
                </Badge>
              </div>

              <div className="grid gap-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{t("collection.customer")}</span>
                  <span className="font-medium">{selectedContractData.customers?.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{t("contracts.loanAmount")}</span>
                  <span className="font-medium">{formatRupiah(selectedContractData.total_loan_amount)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{t("Cicilan yang dibayar")}</span>
                  <span className="font-semibold text-primary">{formatRupiah(selectedContractData.daily_installment_amount)}</span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{t("contracts.progress")}</span>
                    <span className="font-medium">
                      {selectedContractData.current_installment_index}/{selectedContractData.tenor_days}
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {lastPaymentDate && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">{t("collection.lastPayment")}</span>
                    <span className="font-medium">
                      {new Date(lastPaymentDate).toLocaleDateString("id-ID")}
                    </span>
                  </div>
                )}

                {nextCouponDueDate && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">{t("collection.dueDate")}</span>
                    <span className={`font-medium ${lateInfo.isLate ? "text-destructive" : ""}`}>
                      {new Date(nextCouponDueDate).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Late Payment Warning */}
            {lateInfo.isLate && lateInfo.note && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2">
                  <span className="font-semibold">{t("collection.latePayment")}: </span>
                  {lateInfo.lateDays} hari terlambat
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        {/* Payment Details */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Jumlah Kupon
            </Label>
            <Input
              type="number"
              min={1}
              max={maxCoupons}
              value={couponCount}
              onChange={(e) => setCouponCount(Math.max(1, Math.min(maxCoupons, parseInt(e.target.value) || 1)))}
              className="text-center font-semibold"
            />
            {selectedContractData && (
              <p className="text-xs text-muted-foreground">
                Sisa kupon: {remainingCoupons} (maks {maxCoupons})
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Nominal per Kupon</Label>
            <CurrencyInput
              value={paymentAmount}
              onValueChange={handleAmountChange}
              placeholder={
                selectedContractData
                  ? formatRupiah(selectedContractData.daily_installment_amount)
                  : "Rp 0"
              }
            />
            {selectedContractData && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />
                {t("collection.expected")}: {formatRupiah(selectedContractData.daily_installment_amount)}
              </p>
            )}
          </div>
        </div>

        {/* Bulk Payment Summary */}
        {isBulkPayment && selectedContractData && (
          <Alert className="bg-primary/5 border-primary/20">
            <Layers className="h-4 w-4 text-primary" />
            <AlertDescription className="ml-2">
              <div className="flex justify-between items-center">
                <span className="font-medium">Total Pembayaran ({couponCount} kupon):</span>
                <span className="text-lg font-bold text-primary">{formatRupiah(totalBulkAmount)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Kupon {rangeCouponLabel} akan dicatat sebagai PAID
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Collector Selection */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("collection.collector")}</Label>
            <Popover open={collectorOpen} onOpenChange={setCollectorOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={collectorOpen}
                  className="w-full justify-between font-normal"
                >
                  {paymentCollector
                    ? (() => {
                        const collector = collectors?.find((c) => c.id === paymentCollector);
                        return collector ? `${collector.collector_code} - ${collector.name}` : t("collection.selectSales");
                      })()
                    : t("collection.selectSales")}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Cari kolektor..." />
                  <CommandList>
                    <CommandEmpty>Kolektor tidak ditemukan.</CommandEmpty>
                    <CommandGroup>
                      {collectors?.map((collector) => (
                        <CommandItem
                          key={collector.id}
                          value={`${collector.collector_code} ${collector.name}`}
                          onSelect={() => {
                            setPaymentCollector(collector.id);
                            setCollectorOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              paymentCollector === collector.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {collector.collector_code} - {collector.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedContractData?.collector_id && paymentCollector === selectedContractData.collector_id && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                Otomatis dipilih dari kontrak
              </p>
            )}
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("collection.notes")}</Label>
          <Textarea
            value={paymentNotes}
            onChange={(e) => setPaymentNotes(e.target.value)}
            placeholder={
              lateInfo.isLate
                ? t("collection.lateNotePlaceholder")
        : isBulkPayment 
          ? `Default: Kupon yang dibayar adalah ${nextCoupon} - ${endCoupon}`
          : `Default: Pembayaran ke-${nextCoupon}`
            }
            rows={2}
            className={lateInfo.isLate ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          {lateInfo.isLate && (
            <p className="text-xs text-destructive">{t("collection.lateNoteRequired")}</p>
          )}
        </div>

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={!activeSelected || isSubmitting}
          className="w-full"
          size="lg"
        >
          {isSubmitting ? (
            <>
              <span className="animate-spin mr-2">⏳</span>
              {t("common.processing")}
            </>
          ) : isBulkPayment ? (
            <>
              <Layers className="mr-2 h-4 w-4" />
              Catat {couponCount} Kupon Sekaligus
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {t("collection.recordPayment")}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
