import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Pencil, Trash2, Eye, Printer, Check, ChevronsUpDown, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import useStoreOptions from "@/hooks/useStoreOptions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useContracts, useCreateContract, useUpdateContract, useDeleteContract, useInvoiceDetails, ContractWithCustomer } from "@/hooks/useContracts";
import { useCustomers } from "@/hooks/useCustomers";
import { useSalesAgents } from "@/hooks/useSalesAgents";
import { useCollectors } from "@/hooks/useCollectors";
import { useContractStatusMap } from "@/hooks/useContractStatusMap";
import { getStatusLabel, getStatusBadgeClass } from "@/lib/statusCalculation";
import { formatRupiah } from "@/lib/format";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { useCouponsByContract, useGenerateCoupons, InstallmentCoupon } from "@/hooks/useInstallmentCoupons";
import { SearchInput } from "@/components/ui/search-input";
import { PrintCoupon8x5 } from "@/components/print/PrintCoupon8x5";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from '@tanstack/react-query';
import { CurrencyInput } from "@/components/ui/currency-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useAdminNote } from "@/contexts/AdminNoteContext";

export default function Contracts() {
  const { promptAdminNote } = useAdminNote();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const newCustomerId = searchParams.get('newCustomerId');
  const { data: contracts, isLoading } = useContracts();
  const { data: invoiceDetails } = useInvoiceDetails();
  const { data: customers } = useCustomers();
  const { data: salesAgents } = useSalesAgents();
  const { data: collectors } = useCollectors();
  const { data: contractStatusMap } = useContractStatusMap();
  const createContract = useCreateContract();
  const updateContract = useUpdateContract();
  const deleteContract = useDeleteContract();
  const generateCoupons = useGenerateCoupons();
  const queryClient = useQueryClient();
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  // Sort state for contracts
  const [contractSort, setContractSort] = useState<string>('start_newest');
  
  // Filter contracts based on search query
  // Only search by contract_ref and customer name to avoid confusion
  const filteredContracts = contracts?.filter(contract =>
    contract.contract_ref.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (contract.customers?.name && contract.customers.name.toLowerCase().includes(searchQuery.toLowerCase()))
  ) || [];

  const sortedContracts = (() => {
    const arr = [...filteredContracts];
    switch (contractSort) {
      case 'start_newest':
        return arr.sort((a, b) => new Date(b.start_date || 0).getTime() - new Date(a.start_date || 0).getTime());
      case 'start_oldest':
        return arr.sort((a, b) => new Date(a.start_date || 0).getTime() - new Date(b.start_date || 0).getTime());
      case 'ref_asc':
        return arr.sort((a, b) => (a.contract_ref || '').localeCompare(b.contract_ref || ''));
      case 'ref_desc':
        return arr.sort((a, b) => (b.contract_ref || '').localeCompare(a.contract_ref || ''));
      case 'omset_desc':
        return arr.sort((a, b) => (Number(b.total_loan_amount || 0) - Number(a.total_loan_amount || 0)));
      case 'omset_asc':
        return arr.sort((a, b) => (Number(a.total_loan_amount || 0) - Number(b.total_loan_amount || 0)));
      default:
        return arr;
    }
  })();
  
  const ITEMS_PER_PAGE = 5;
  const { currentPage, totalPages, paginatedItems, goToPage, totalItems } = usePagination(sortedContracts, ITEMS_PER_PAGE);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [pendingAction, setPendingAction] = useState<"update" | "delete" | "return" | "print" | null>(null);
  const [pendingPrintContract, setPendingPrintContract] = useState<ContractWithCustomer | null>(null);
  const [pendingPrintCoupons, setPendingPrintCoupons] = useState<InstallmentCoupon[] | null>(null);
  const [selectedContract, setSelectedContract] = useState<ContractWithCustomer | null>(null);
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);
  
  // Combobox state for searchable dropdowns
  const [customerOpen, setCustomerOpen] = useState(false);
  const [salesAgentOpen, setSalesAgentOpen] = useState(false);
  const [collectorOpen, setCollectorOpen] = useState(false);
  const [productStorePopoverOpen, setProductStorePopoverOpen] = useState(false);
  const { data: storeOptions = [] } = useStoreOptions();
  
  const [formData, setFormData] = useState({
    contract_ref: "",
    customer_id: "",
    sales_agent_id: "",
    collector_id: "",
    product_type: "",
    total_loan_amount: 0,
    tenor_days: "100",
    daily_installment_amount: 0,
    start_date: new Date().toISOString().split("T")[0],
    status: "active",
    modal: 0,
    dp: 0,
    keuntungan: 0,
  });

  // Product rows for the contract (No, Nama, Harga, Status, Toko, Tgl Ambil)
  type ProductRow = { id?: string; name: string; price: number; status: 'hutang' | 'cash'; store: string; pickup_date: string };
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [newProduct, setNewProduct] = useState<ProductRow>({ name: '', price: 0, status: 'cash', store: '', pickup_date: '' });
  // Mode lama: input data lama tanpa daftar produk; Modal Awal diisi manual
  const [legacyMode, setLegacyMode] = useState(false);

  // Auto-sync product_type textarea with product names list (kecuali mode lama)
  useEffect(() => {
    if (legacyMode) return;
    const joined = products.map((p) => p.name).filter(Boolean).join(', ');
    setFormData((prev) => (prev.product_type === joined ? prev : { ...prev, product_type: joined }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, legacyMode]);

  // Auto-compute Modal Awal = total harga produk + DP (read-only) — kecuali mode lama
  useEffect(() => {
    if (legacyMode) return;
    const totalProducts = products.reduce((s, p) => s + (Number(p.price) || 0), 0);
    // New rule: Modal Awal = harga product - DP
    const computedModal = totalProducts - (Number(formData.dp) || 0);
    setFormData((prev) => (prev.modal === computedModal ? prev : { ...prev, modal: computedModal }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, formData.dp, legacyMode]);

  const handleAddProduct = () => {
    const name = newProduct.name.trim();
    if (!name) { toast.error('Nama produk wajib diisi'); return; }
    const pickup = newProduct.pickup_date || formData.start_date;
    setProducts((arr) => [...arr, { ...newProduct, name, store: newProduct.store.trim(), pickup_date: pickup }]);
    setNewProduct({ name: '', price: 0, status: 'cash', store: '', pickup_date: '' });
  };
  const handleRemoveProduct = (idx: number) => {
    setProducts((arr) => arr.filter((_, i) => i !== idx));
  };
  const handleUpdateProductPickup = (idx: number, value: string) => {
    setProducts((arr) => arr.map((p, i) => i === idx ? { ...p, pickup_date: value } : p));
  };

  // Replace all contract_products for the given contract with the current list
  const syncContractProducts = async (contractId: string) => {
    try {
      await (supabase as any).from('contract_products').delete().eq('contract_id', contractId);
      if (products.length === 0) {
        // Invalidate nota/contract_products list so other pages refresh
        queryClient.invalidateQueries({ queryKey: ['contract_products_all'] });
        return;
      }
      const rows = products.map((p, i) => ({
        contract_id: contractId,
        position: i + 1,
        name: p.name,
        price: p.price || 0,
        status: p.status,
        store: p.store || null,
        pickup_date: p.pickup_date || null,
      }));
      const { error } = await (supabase as any).from('contract_products').insert(rows);
      if (error) {
        console.error('Failed to save contract products:', error);
        toast.error('Gagal menyimpan daftar produk: ' + error.message);
      }
      else {
        // Refresh cached list used by NotaBelanja
        queryClient.invalidateQueries({ queryKey: ['contract_products_all'] });
      }
    } catch (e: any) {
      console.error(e);
      toast.error('Gagal menyimpan daftar produk');
    }
  };

  // Fetch coupons for selected contract (for detail view and printing)
  const { data: selectedContractCoupons } = useCouponsByContract(selectedContract?.id || null);
  
  // Generate next contract code (A001, A002, etc.)
  const generateNextContractCode = () => {
    if (!contracts || contracts.length === 0) {
      return "A001";
    }
    
    // Extract all codes that match pattern A followed by digits
    const existingCodes = contracts
      .map(c => c.contract_ref)
      .filter(ref => /^A\d+$/.test(ref))
      .map(ref => parseInt(ref.substring(1), 10))
      .filter(num => !isNaN(num));
    
    if (existingCodes.length === 0) {
      return "A001";
    }
    
    const maxCode = Math.max(...existingCodes);
    const nextNumber = maxCode + 1;
    return `A${nextNumber.toString().padStart(3, '0')}`;
  };

  const [printMode, setPrintMode] = useState(false);
  const [tempPrintedCoupons, setTempPrintedCoupons] = useState<InstallmentCoupon[] | null>(null);
  const [tempPrintedContract, setTempPrintedContract] = useState<ContractWithCustomer | null>(null);

  // Handle highlighting item from global search
  useEffect(() => {
    if (highlightId && contracts?.length) {
      const targetContract = contracts.find(c => c.id === highlightId);
      if (targetContract) {
        setHighlightedRowId(highlightId);
        
        // Find the page where this contract is located
        const contractIndex = contracts.findIndex(c => c.id === highlightId);
        const targetPage = Math.floor(contractIndex / 5) + 1;
        
        // Navigate to the correct page
        if (targetPage !== currentPage) {
          goToPage(targetPage);
        }
        
        // Auto scroll and highlight
        setTimeout(() => {
          if (highlightedRowRef.current) {
            highlightedRowRef.current.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center' 
            });
          }
          // Remove highlight after 3 seconds
          setTimeout(() => {
            setHighlightedRowId(null);
            // Remove highlight parameter from URL
            searchParams.delete('highlight');
            setSearchParams(searchParams, { replace: true });
          }, 3000);
        }, 100);
      }
    }
  }, [highlightId, contracts, currentPage, goToPage, searchParams, setSearchParams]);

  // Auto-open create dialog with pre-selected customer from Customers page
  useEffect(() => {
    if (newCustomerId && customers?.length) {
      const customer = customers.find(c => c.id === newCustomerId);
      if (customer) {
        setSelectedContract(null);
        setFormData({
          contract_ref: generateNextContractCode(),
          customer_id: newCustomerId,
          sales_agent_id: "",
          collector_id: "",
          product_type: "",
          total_loan_amount: 0,
          tenor_days: "100",
          daily_installment_amount: 0,
          start_date: new Date().toISOString().split("T")[0],
          status: "active",
          modal: 0,
          dp: 0,
          keuntungan: 0,
        });
        setProducts([]);
        setNewProduct({ name: '', price: 0, status: 'cash', store: '', pickup_date: '' });
        setDialogOpen(true);
        // Remove param from URL
        searchParams.delete('newCustomerId');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [newCustomerId, customers]);

  const handleOpenCreate = () => {
    setSelectedContract(null);
    setFormData({
      contract_ref: generateNextContractCode(),
      customer_id: "",
      sales_agent_id: "",
      collector_id: "",
      product_type: "",
      total_loan_amount: 0,
      tenor_days: "100",
      daily_installment_amount: 0,
      start_date: new Date().toISOString().split("T")[0],
      status: "active",
      modal: 0,
      dp: 0,
      keuntungan: 0,
    });
    setProducts([]);
    setNewProduct({ name: '', price: 0, status: 'cash', store: '', pickup_date: '' });
    setDialogOpen(true);
  };

  // Kontrak hanya bisa diedit jika belum ada transaksi (belum ada cicilan terbayar)
  const hasTransactions = (contract: ContractWithCustomer) => {
    return (contract.current_installment_index || 0) > 0;
  };

  const handleOpenEdit = (contract: ContractWithCustomer) => {
    if (hasTransactions(contract)) {
      // Allow editing even if there are transactions, but warn the user
      toast.warning("Perhatian: kontrak ini sudah memiliki transaksi. Pastikan perubahan tidak merusak data pembayaran yang ada.");
    }
    setSelectedContract(contract);
    setFormData({
      contract_ref: contract.contract_ref,
      customer_id: contract.customer_id,
      sales_agent_id: contract.sales_agent_id || "",
      collector_id: contract.collector_id || "",
      product_type: contract.product_type || "",
      total_loan_amount: contract.total_loan_amount,
      tenor_days: contract.tenor_days.toString(),
      daily_installment_amount: contract.daily_installment_amount,
      start_date: contract.start_date || new Date().toISOString().split("T")[0],
      status: contract.status,
  // omset yang tersimpan = total harga produk; modal = omset - dp per definisi baru
  modal: ((contract as any).omset || 0) - ((contract as any).dp || 0),
      dp: (contract as any).dp || 0,
      // Convert stored TOTAL keuntungan -> per-day for UI display
      keuntungan: (() => {
        const totalKeuntungan = (contract as any).keuntungan || 0;
        const tenor = contract.tenor_days || 0;
        return tenor > 0 ? Math.round(totalKeuntungan / tenor) : 0;
      })(),
    });
    // Load existing products
    setNewProduct({ name: '', price: 0, status: 'cash', store: '', pickup_date: '' });
    (async () => {
      const { data, error } = await (supabase as any)
        .from('contract_products')
        .select('id, name, price, status, store, position, pickup_date')
        .eq('contract_id', contract.id)
        .order('position', { ascending: true });
      if (error) {
        console.error('Failed to load contract products:', error);
        setProducts([]);
        setLegacyMode(true);
      } else {
        const loaded = ((data || []) as any[]).map((p) => ({
          id: p.id,
          name: p.name,
          price: Number(p.price || 0),
          status: (p.status === 'hutang' ? 'hutang' : 'cash') as 'hutang' | 'cash',
          store: p.store || '',
          pickup_date: p.pickup_date || '',
        }));
        setProducts(loaded);
        // Tanpa daftar produk → asumsikan data lama
        setLegacyMode(loaded.length === 0);
      }
    })();
    setDialogOpen(true);
  };

  const handleOpenDetail = (contract: ContractWithCustomer) => {
    setSelectedContract(contract);
    setDetailDialogOpen(true);
  };

  const calculateInstallment = () => {
    const amount = formData.total_loan_amount || 0;
    const tenor = parseInt(formData.tenor_days) || 100;
    return Math.ceil(amount / tenor);
  };

  const verifyPassword = async (password: string): Promise<boolean> => {
    // Password admin diambil dari tabel app_settings (key='admin_password')
    const { data, error } = await (supabase as any)
      .from("app_settings")
      .select("value")
      .eq("key", "admin_password")
      .maybeSingle();
    if (error || !data) {
      // Fallback default kalau tabel belum tersedia
      return password === "Kemuje97";
    }
    return password === data.value;
  };

  const handlePasswordSubmit = async () => {
    if (!passwordInput.trim()) {
      toast.error("Password harus diisi");
      return;
    }

    try {
      const isValid = await verifyPassword(passwordInput);
      if (!isValid) {
        toast.error("Password salah");
        setPasswordInput("");
        return;
      }

      // Password benar, lanjutkan dengan action yang pending
      setPasswordDialogOpen(false);
      setPasswordInput("");

      if (pendingAction === "update") {
        await executeContractUpdate();
      } else if (pendingAction === "delete") {
        await executeContractDelete();
      } else if (pendingAction === "return") {
        await executeContractReturn();
      } else if (pendingAction === "print") {
        if (pendingPrintCoupons && pendingPrintContract) {
          doPrint(pendingPrintCoupons, pendingPrintContract);
          incrementPrintCount(pendingPrintContract.id);
        }
        setPendingPrintCoupons(null);
        setPendingPrintContract(null);
      }
    } catch (error) {
      console.error('Password verification error:', error);
      toast.error("Gagal verifikasi password");
    }
  };

  const handleSubmit = async () => {
    // Validation for customer (required for both create and update)
    if (!formData.customer_id) {
      toast.error("Pelanggan harus dipilih");
      return;
    }
    
    // Validation for start date (required for both create and update)
    if (!formData.start_date) {
      toast.error("Tanggal mulai harus diisi");
      return;
    }
    
    // Validation for total loan amount (required for both create and update)
    if (!formData.total_loan_amount || formData.total_loan_amount <= 0) {
      toast.error("Total pinjaman harus diisi dan lebih dari 0");
      return;
    }
    
    // Validation for tenor days (required for both create and update)
    if (!formData.tenor_days || parseInt(formData.tenor_days) <= 0) {
      toast.error("Tenor harus diisi dan lebih dari 0");
      return;
    }
    
    // Validation for modal awal (required for both create and update)
    if (!formData.modal || formData.modal <= 0) {
      toast.error("Modal awal harus diisi dan lebih dari 0");
      return;
    }

    // Modal Awal otomatis = total harga produk + DP (sudah terisi otomatis, tidak perlu validasi)

    // Validasi tanggal pengambilan per produk wajib diisi
    const missingPickup = products.find((p) => !p.pickup_date);
    if (missingPickup) {
      toast.error(`Tanggal pengambilan wajib diisi untuk produk: ${missingPickup.name}`);
      return;
    }
    
    
    // Validation for new contracts (CREATE only)
    if (!selectedContract) {
      if (!formData.sales_agent_id) {
        toast.error("Sales agent harus dipilih untuk kontrak baru");
        return;
      }
      if (!formData.collector_id) {
        toast.error("Kolektor harus dipilih untuk kontrak baru");
        return;
      }
    }

    // Validasi selesai, tampilkan password dialog
    setPendingAction("update");
    setPasswordDialogOpen(true);
  };

  const executeContractUpdate = async () => {
    try {
      const dailyAmount = formData.daily_installment_amount || calculateInstallment();
      const tenorDays = parseInt(formData.tenor_days) || 100;
      const modalEfektif = Math.max(0, (formData.modal || 0) - (formData.dp || 0));

      if (selectedContract) {
        // UPDATE KONTRAK — minta catatan admin
        const note = await promptAdminNote({
          title: "Catatan Pembaruan Kontrak",
          description: `Tuliskan alasan perubahan kontrak ${selectedContract.contract_ref}.`,
        });
        if (!note) return;
        const prev = selectedContract;
        // compute totalProducts from products
        const totalProductsForSave = products.reduce((s, p) => s + (Number(p.price) || 0), 0);
        const updateRes = await updateContract.mutateAsync({
          id: selectedContract.id,
          contract_ref: formData.contract_ref,
          customer_id: formData.customer_id,
          sales_agent_id: formData.sales_agent_id || null,
          collector_id: formData.collector_id || null,
          product_type: formData.product_type || null,
          total_loan_amount: formData.total_loan_amount || 0,
          tenor_days: tenorDays,
          daily_installment_amount: dailyAmount,
          start_date: formData.start_date,
          status: formData.status,
          // store omset as total harga produk (totalProductsForSave)
          omset: Math.max(0, totalProductsForSave),
          dp: formData.dp || 0,
          _note: note,
        } as any);

        // Jika field yang mempengaruhi kupon berubah, regenerate kupon agar
        // tampilan print/preview ikut diperbarui.
        const couponAffectingChanged =
          prev.tenor_days !== tenorDays ||
          Number(prev.daily_installment_amount) !== Number(dailyAmount) ||
          prev.start_date !== formData.start_date;

        if (couponAffectingChanged) {
          // Cek apakah sudah ada kupon yang dibayar — jangan regenerate jika ada
          const { data: paidCoupons } = await supabase
            .from('installment_coupons')
            .select('id')
            .eq('contract_id', selectedContract.id)
            .eq('status', 'paid')
            .limit(1);

          if (paidCoupons && paidCoupons.length > 0) {
            toast.warning(
              "Kontrak diperbarui, namun kupon tidak di-regenerate karena sudah ada pembayaran."
            );
          } else {
            // Hapus kupon lama lalu generate ulang dengan data terbaru
            const { error: delErr } = await supabase
              .from('installment_coupons')
              .delete()
              .eq('contract_id', selectedContract.id);
            if (delErr) {
              console.error('Gagal hapus kupon lama:', delErr);
              toast.error('Gagal menghapus kupon lama untuk regenerate');
            } else {
              await generateCoupons.mutateAsync({
                contractId: selectedContract.id,
                startDate: formData.start_date,
                tenorDays: tenorDays,
                dailyAmount: dailyAmount,
              });
              queryClient.invalidateQueries({
                queryKey: ['installment_coupons', 'contract', selectedContract.id],
              });
            }
          }
        }

        // Sync product list (replace all)
        await syncContractProducts(selectedContract.id);

        // Refresh selectedContract di state lokal supaya preview/print pakai data baru
        if (updateRes?.data) {
          setSelectedContract(updateRes.data as ContractWithCustomer);
        }
        toast.success("Kontrak berhasil diperbarui");
      } else {
        // CREATE KONTRAK
        const totalProductsForSave = products.reduce((s, p) => s + (Number(p.price) || 0), 0);
        const { data: newContract } = await createContract.mutateAsync({
          contract_ref: formData.contract_ref,
          customer_id: formData.customer_id,
          sales_agent_id: formData.sales_agent_id || null,
          collector_id: formData.collector_id || null,
          product_type: formData.product_type || null,
          total_loan_amount: formData.total_loan_amount || 0,
          tenor_days: tenorDays,
          daily_installment_amount: dailyAmount,
          start_date: formData.start_date,
          status: formData.status,
          // store omset as total harga produk (totalProductsForSave)
          omset: Math.max(0, totalProductsForSave),
          dp: formData.dp || 0,
        } as any);
        
        // Generate installment coupons for new active contracts
        if (formData.status === "active" && newContract?.id) {
          await generateCoupons.mutateAsync({
            contractId: newContract.id,
            startDate: formData.start_date,
            tenorDays: tenorDays,
            dailyAmount: dailyAmount,
          });
          toast.success(`Kontrak dibuat dengan ${tenorDays} kupon`);
        } else {
          toast.success("Kontrak berhasil dibuat");
        }
        if (newContract?.id) {
          await syncContractProducts(newContract.id);
        }
      }
      setDialogOpen(false);
    } catch (error) {
      console.error('Update/Create contract error:', error);
      
      // Provide specific error message
      if (error instanceof Error) {
        if (error.message.includes('permission')) {
          toast.error("Anda tidak memiliki izin untuk melakukan operasi ini");
        } else if (error.message.includes('unique')) {
          toast.error("Kode kontrak sudah digunakan. Gunakan kode yang berbeda.");
        } else {
          toast.error(`Gagal menyimpan data: ${error.message}`);
        }
      } else {
        toast.error("Gagal menyimpan data. Silakan coba lagi.");
      }
    }
  };

  // Create contract, generate coupons (if active) and immediately trigger print flow
  const handleCreateAndPrint = async () => {
    if (!formData.customer_id) {
      toast.error("Pilih pelanggan terlebih dahulu");
      return;
    }
    if (!formData.start_date) {
      toast.error("Pilih tanggal mulai terlebih dahulu");
      return;
    }
    if (!formData.sales_agent_id) {
      toast.error("Pilih sales agent terlebih dahulu");
      return;
    }
    if (!formData.collector_id) {
      toast.error("Pilih kolektor terlebih dahulu");
      return;
    }
    if (!formData.total_loan_amount || formData.total_loan_amount <= 0) {
      toast.error("Total pinjaman harus diisi dan lebih dari 0");
      return;
    }
    if (!formData.tenor_days || parseInt(formData.tenor_days) <= 0) {
      toast.error("Tenor harus diisi dan lebih dari 0");
      return;
    }
    if (!formData.modal || formData.modal <= 0) {
      toast.error("Modal awal harus diisi dan lebih dari 0");
      return;
    }

    try {
      const dailyAmount = formData.daily_installment_amount || calculateInstallment();
      const tenorDays = parseInt(formData.tenor_days) || 100;
      const modalEfektif = Math.max(0, (formData.modal || 0) - (formData.dp || 0));

      // Paksa status active agar kupon dibuat & bisa langsung dicetak
      const statusForPrint = "active";

      const { data: newContract } = await createContract.mutateAsync({
        contract_ref: formData.contract_ref,
        customer_id: formData.customer_id,
        sales_agent_id: formData.sales_agent_id || null,
        collector_id: formData.collector_id || null,
        product_type: formData.product_type || null,
        total_loan_amount: formData.total_loan_amount || 0,
        tenor_days: tenorDays,
        daily_installment_amount: dailyAmount,
        start_date: formData.start_date,
        status: statusForPrint,
        omset: modalEfektif,
        dp: formData.dp || 0,
      } as any);

      if (!newContract?.id) {
        toast.error("Kontrak tidak berhasil dibuat");
        return;
      }

      // Persist product list for new contract
      await syncContractProducts(newContract.id);


      // Generate kupon
      await generateCoupons.mutateAsync({
        contractId: newContract.id,
        startDate: formData.start_date,
        tenorDays: tenorDays,
        dailyAmount: dailyAmount,
      });
      toast.success(`Kontrak dibuat dengan ${tenorDays} kupon`);

      // Poll sampai kupon tersedia
      let couponsAvailable: any[] = [];
      const maxAttempts = 6;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const { data: couponsData, error: fetchError } = await supabase
          .from('installment_coupons')
          .select('*')
          .eq('contract_id', newContract.id)
          .order('installment_index', { ascending: true });

        if (fetchError) {
          console.error('Error fetching coupons after generate:', fetchError);
          break;
        }
        if (couponsData && (couponsData as any[]).length > 0) {
          couponsAvailable = couponsData as any[];
          break;
        }
        await new Promise((res) => setTimeout(res, 500));
      }

      // Fetch full contract dengan relasi (customer/sales/collector) untuk print
      let fullContract: ContractWithCustomer | null = null;
      const { data: contractFullData, error: contractFetchError } = await supabase
        .from('credit_contracts')
        .select('*, customers(name, address, business_address, phone), sales_agents(name, agent_code), collectors(name, collector_code)')
        .eq('id', newContract.id)
        .single();
      if (contractFetchError) {
        console.error('Failed to fetch full contract for printing:', contractFetchError);
      } else {
        fullContract = contractFullData as ContractWithCustomer;
      }

      setDialogOpen(false);
      setSelectedContract((fullContract || newContract) as ContractWithCustomer);

      if (couponsAvailable.length === 0) {
        toast.warning('Kupon belum tersedia untuk dicetak. Buka detail kontrak lalu cetak manual.');
        try { queryClient.invalidateQueries({ queryKey: ['installment_coupons', 'contract', newContract.id] }); } catch (e) { /* noop */ }
        return;
      }

      // Prime cache supaya hook melihat kupon baru segera
      try {
        queryClient.setQueryData(['installment_coupons', 'contract', newContract.id], couponsAvailable);
      } catch (e) {
        console.error('Failed to set query data for coupons:', e);
      }

      // Trigger print (cetak pertama dari "Buat & Cetak")
      doPrint(couponsAvailable, (fullContract || newContract) as ContractWithCustomer);
      incrementPrintCount(newContract.id);
    } catch (error) {
      console.error('handleCreateAndPrint error:', error);
      const msg = error instanceof Error ? error.message : 'Gagal membuat kontrak / mencetak kupon';
      toast.error(msg);
    }
  };

  const handleDeleteClick = () => {
    if (!selectedContract) return;
    setPendingAction("delete");
    setPasswordDialogOpen(true);
  };

  const executeContractDelete = async () => {
    if (!selectedContract) return;
    try {
      const note = await promptAdminNote({
        title: "Catatan Hapus Kontrak",
        description: `Tuliskan alasan menghapus kontrak ${selectedContract.contract_ref}.`,
        confirmLabel: "Hapus",
        variant: "destructive",
      });
      if (!note) return;
      await deleteContract.mutateAsync({ id: selectedContract.id, _note: note });
      toast.success("Kontrak berhasil dihapus");
      setDeleteDialogOpen(false);
      setSelectedContract(null);
    } catch (error) {
      console.error('Delete contract error:', error);
      const msg = error instanceof Error ? error.message : 'Gagal menghapus kontrak';
      toast.error(msg);
    }
  };

  const handleReturnClick = () => {
    if (!selectedContract) return;
    setPendingAction("return");
    setPasswordDialogOpen(true);
  };

  const executeContractReturn = async () => {
    if (!selectedContract) return;
    try {
      // Tandai kontrak sebagai returned (macet permanen)
      const note = await promptAdminNote({
        title: "Catatan Return Kontrak",
        description: `Tuliskan alasan menandai kontrak ${selectedContract.contract_ref} sebagai Return / Macet.`,
        confirmLabel: "Tandai Return",
        variant: "destructive",
      });
      if (!note) return;
      await updateContract.mutateAsync({
        id: selectedContract.id,
        status: "returned",
        _note: note,
      } as any);
      // Batalkan kupon yang masih unpaid agar tidak menambah outstanding/sisa tagihan
      const { error: cErr } = await supabase
        .from("installment_coupons")
        .update({ status: "cancelled" })
        .eq("contract_id", selectedContract.id)
        .eq("status", "unpaid");
      if (cErr) console.warn("Gagal cancel kupon:", cErr);

      // Refresh data terkait
      queryClient.invalidateQueries({ queryKey: ["credit_contracts"] });
      queryClient.invalidateQueries({ queryKey: ["installment_coupons"] });
      queryClient.invalidateQueries({ queryKey: ["outstanding_coupons"] });
      queryClient.invalidateQueries({ queryKey: ["agent_performance_contract"] });
      queryClient.invalidateQueries({ queryKey: ["agent_omset_contract"] });
      queryClient.invalidateQueries({ queryKey: ["monthly_performance_contract"] });
      queryClient.invalidateQueries({ queryKey: ["yearly_financial_summary"] });

      toast.success("Kontrak ditandai Macet (Return). Sisa tagihan & omset sales otomatis menyesuaikan.");
      setReturnDialogOpen(false);
      setSelectedContract(null);
    } catch (error) {
      console.error(error);
      toast.error("Gagal me-return kontrak");
    }
  };

  // Hitung berapa kali kupon kontrak ini sudah pernah dicetak (per-browser).
  const PRINT_COUNT_KEY = (contractId: string) => `coupon_print_count_${contractId}`;
  const getPrintCount = (contractId: string): number => {
    try {
      return parseInt(localStorage.getItem(PRINT_COUNT_KEY(contractId)) || "0", 10) || 0;
    } catch { return 0; }
  };
  const incrementPrintCount = (contractId: string) => {
    try {
      const next = getPrintCount(contractId) + 1;
      localStorage.setItem(PRINT_COUNT_KEY(contractId), String(next));
    } catch { /* noop */ }
  };

  const handlePrintAllCoupons = () => {
    // Default print path uses currently loaded coupons from hook
    if (!selectedContractCoupons?.length) {
      toast.error("Tidak ada kupon untuk dicetak");
      return;
    }
    if (!selectedContract) return;
    // Cetak ulang (>1x) wajib password
    if (getPrintCount(selectedContract.id) >= 1) {
      setPendingPrintCoupons(selectedContractCoupons as InstallmentCoupon[]);
      setPendingPrintContract(selectedContract);
      setPendingAction("print");
      setPasswordDialogOpen(true);
      return;
    }
    doPrint(selectedContractCoupons, selectedContract);
    incrementPrintCount(selectedContract.id);
  };

  // Centralized print helper that accepts coupons + contract directly.
  const doPrint = (coupons: InstallmentCoupon[] | undefined | null, contract: ContractWithCustomer | null) => {
    if (!coupons || coupons.length === 0 || !contract) {
      console.error('doPrint called but coupons or contract missing', { coupons, contract });
      toast.error("Tidak ada kupon untuk dicetak");
      return;
    }

    // Deduplicate coupons by id (defensive) and sort by installment_index
    const uniqueMap = new Map<string, InstallmentCoupon>();
    (coupons || []).forEach((c) => {
      if (c && c.id) uniqueMap.set(c.id, c);
    });
    const uniqueCoupons = Array.from(uniqueMap.values()).sort((a, b) => (a.installment_index || 0) - (b.installment_index || 0));

    console.info('doPrint: deduped coupons count', uniqueCoupons.length);
    console.debug('doPrint: sample coupons', uniqueCoupons.slice(0,3));

    // Show instruction to user
    toast.info("Pastikan print dialog menggunakan orientasi Landscape dan ukuran A4", {
      duration: 4000,
    });

    // Use temporary state so PrintCoupon8x5 can render the coupons immediately
  setTempPrintedCoupons(uniqueCoupons as InstallmentCoupon[]);
    setTempPrintedContract(contract);
    setPrintMode(true);

    // Force add print styles for landscape
    const printStyleId = 'force-landscape-print';
    const existingStyle = document.getElementById(printStyleId);
    if (existingStyle) existingStyle.remove();

    const printStyle = document.createElement('style');
    printStyle.id = printStyleId;
    printStyle.textContent = `
      @media print {
        @page { 
          size: A4 landscape; 
          margin: 0; 
        }
        html, body { 
          width: 297mm; 
          margin: 0; 
          padding: 0;
          background: white !important;
        }
        body > *:not(.print-coupon-wrapper) {
          display: none !important;
        }
        .print-coupon-wrapper {
          display: block !important;
        }
      }
    `;
    document.head.appendChild(printStyle);

    // Add class to body for print mode
    document.body.classList.add('printing-coupons');

    // Delay 2 detik agar background SVG (Mahkota-Jaya) ter-render sempurna
    // sebelum dialog cetak dibuka.
    setTimeout(() => {
      console.log("Triggering print dialog with A4 landscape settings (direct)");
      window.print();

      // Clean up after printing with onafterprint or timeout
      const cleanup = () => {
        setPrintMode(false);
        setTempPrintedCoupons(null);
        setTempPrintedContract(null);
        document.body.classList.remove('printing-coupons');
        const style = document.getElementById(printStyleId);
        if (style) style.remove();
      };

      // Listen for print dialog close
      window.addEventListener('afterprint', cleanup, { once: true });

      // Fallback cleanup after delay
      setTimeout(cleanup, 2000);
    }, 2000);
  };


  const getNoFaktur = (contractId: string) => {
    const invoice = invoiceDetails?.find((i) => i.id === contractId);
    return invoice?.no_faktur || "-";
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      {/* Print Mode: High Precision Coupon Print System */}

      {printMode && tempPrintedContract && tempPrintedCoupons && (
        <PrintCoupon8x5
          coupons={tempPrintedCoupons}
          contract={{
            contract_ref: tempPrintedContract.contract_ref,
            tenor_days: tempPrintedContract.tenor_days,
            customers: tempPrintedContract.customers ? {
              name: tempPrintedContract.customers.name,
              address: tempPrintedContract.customers.address || null,
              business_address: tempPrintedContract.customers.business_address || null,
              phone: tempPrintedContract.customers.phone || null,
            } : null,
            sales_agents: tempPrintedContract.sales_agents || null,
            collectors: tempPrintedContract.collectors || null,
          }}
        />
      )}

      <div className="flex justify-between items-center print:hidden">
        <h2 className="text-2xl font-bold">Kontrak Kredit</h2>
        <Button onClick={handleOpenCreate}>
          <Plus className="mr-2 h-4 w-4" /> Kontrak Baru
        </Button>
      </div>

      {/* Search Input */}
      <div className="space-y-4">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Cari kontrak berdasarkan nomor kontrak atau nama pelanggan..."
          className="max-w-lg"
        />
        <div className="flex items-center gap-3">
          <div className="w-56">
            <Select onValueChange={(v) => setContractSort(v)} defaultValue={contractSort}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Urutkan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="start_newest">Mulai: Terbaru</SelectItem>
                <SelectItem value="start_oldest">Mulai: Terlama</SelectItem>
                <SelectItem value="ref_asc">Kode Kontrak A → Z</SelectItem>
                <SelectItem value="ref_desc">Kode Kontrak Z → A</SelectItem>
                <SelectItem value="omset_desc">Omset Tertinggi</SelectItem>
                <SelectItem value="omset_asc">Omset Terendah</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          Menampilkan {totalItems} dari {contracts?.length || 0} kontrak
        </div>
      </div>

      <div className="border rounded-lg print:hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kode Kontrak</TableHead>
              <TableHead>Pelanggan</TableHead>
              <TableHead>Kode Sales</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">Memuat...</TableCell>
                  </TableRow>
            ) : filteredContracts?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {searchQuery ? `Tidak ada kontrak yang ditemukan dengan kata kunci "${searchQuery}"` : "Tidak ada data kontrak"}
                </TableCell>
              </TableRow>
            ) : (
              paginatedItems.map((contract) => {
                const progress = (contract.current_installment_index / contract.tenor_days) * 100;
                const paidAmount = contract.current_installment_index * contract.daily_installment_amount;
                const remainingAmount = (contract.tenor_days - contract.current_installment_index) * contract.daily_installment_amount;
                
                const createdAt = new Date(contract.created_at);
                const today = new Date();
                const daysElapsed = Math.max(1, Math.floor((today.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));
                const daysPerDue = contract.current_installment_index > 0 
                  ? (daysElapsed / contract.current_installment_index).toFixed(1) 
                  : "0";
                const daysPerDueNum = parseFloat(daysPerDue);
                
                const statusInfo = contractStatusMap?.get(contract.id);
                const effectiveStatus = contract.status === "returned"
                  ? "macet"
                  : (statusInfo?.status ?? (contract.status === "completed" ? "completed" : "sangat_lancar"));
                const statusLabel = contract.status === "returned"
                  ? "Macet (Return)"
                  : getStatusLabel(effectiveStatus as any);
                const badgeClass = getStatusBadgeClass(effectiveStatus as any);

                return (
                  <TableRow 
                    key={contract.id}
                    ref={highlightedRowId === contract.id ? highlightedRowRef : null}
                    className={cn(
                      highlightedRowId === contract.id && "bg-yellow-100 border-yellow-300 animate-pulse"
                    )}
                  >
                    <TableCell className="font-medium">{contract.contract_ref}</TableCell>
                    <TableCell>{contract.customers?.name}</TableCell>
                    <TableCell>{salesAgents?.find(a => a.id === contract.sales_agent_id)?.agent_code || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={progress} className="w-16 h-2" />
                        <span className="text-xs text-muted-foreground">
                          {contract.current_installment_index}/{contract.tenor_days}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={badgeClass} variant="outline">
                        {statusLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenDetail(contract)} title="Lihat Detail">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEdit(contract)}
                        title={hasTransactions(contract) ? "Edit (kontrak sudah memiliki transaksi)" : "Edit"}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {contract.status !== "returned" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Return Kontrak (tandai Macet)"
                          onClick={() => {
                            setSelectedContract(contract);
                            setReturnDialogOpen(true);
                          }}
                        >
                          <Undo2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Hapus"
                        onClick={() => {
                          setSelectedContract(contract);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={goToPage}
          totalItems={totalItems}
        />
      </div>

      {/* Create/Edit Dialog - Enhanced with Scrolling Mechanism */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[80vw] max-w-[80vw] sm:max-w-[80vw] max-h-[90vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 p-6 pb-4">
            <DialogTitle>{selectedContract ? "Edit Kontrak" : "Kontrak Kredit Baru"}</DialogTitle>
          </DialogHeader>
          
          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-6">
            <div className="space-y-4 pb-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="contract_ref">Kode Kontrak</Label>
                    <Input
                      id="contract_ref"
                      value={formData.contract_ref}
                      onChange={(e) => setFormData({ ...formData, contract_ref: e.target.value.toUpperCase() })}
                      placeholder="Contoh: A001"
                    />
                    {!selectedContract && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Kode otomatis: A001, A002, dst.
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="customer">
                      Pelanggan <span className="text-red-500">*</span>
                    </Label>
                    <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={customerOpen}
                          className="w-full justify-between font-normal"
                        >
                          {formData.customer_id
                            ? customers?.find((c) => c.id === formData.customer_id)?.name
                            : "Cari pelanggan..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Ketik nama pelanggan..." />
                          <CommandList>
                            <CommandEmpty>Pelanggan tidak ditemukan.</CommandEmpty>
                            <CommandGroup>
                              {customers?.map((customer) => (
                                <CommandItem
                                  key={customer.id}
                                  value={customer.name}
                                  onSelect={() => {
                                    setFormData({ ...formData, customer_id: customer.id });
                                    setCustomerOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      formData.customer_id === customer.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {customer.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="sales_agent">
                    Sales Agent {!selectedContract && <span className="text-red-500">*</span>}
                  </Label>
                  <Popover open={salesAgentOpen} onOpenChange={setSalesAgentOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={salesAgentOpen}
                        className="w-full justify-between font-normal"
                      >
                        {formData.sales_agent_id
                          ? (() => {
                              const agent = salesAgents?.find((a) => a.id === formData.sales_agent_id);
                              return agent ? `${agent.name} (${agent.agent_code})` : "Cari sales agent...";
                            })()
                          : "Cari sales agent..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Ketik nama atau kode agent..." />
                        <CommandList>
                          <CommandEmpty>Sales agent tidak ditemukan.</CommandEmpty>
                          <CommandGroup>
                            {salesAgents?.filter((a) => a.is_active !== false || a.id === formData.sales_agent_id).map((agent) => (
                              <CommandItem
                                key={agent.id}
                                value={`${agent.name} ${agent.agent_code}`}
                                onSelect={() => {
                                  setFormData({ ...formData, sales_agent_id: agent.id });
                                  setSalesAgentOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    formData.sales_agent_id === agent.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {agent.name} ({agent.agent_code})
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground mt-1">
                    Komisi akan otomatis masuk ke sales ini
                  </p>
                </div>
                
                <div>
                  <Label htmlFor="collector">
                    Kolektor {!selectedContract && <span className="text-red-500">*</span>}
                  </Label>
                  <Popover open={collectorOpen} onOpenChange={setCollectorOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={collectorOpen}
                        className="w-full justify-between font-normal"
                      >
                        {formData.collector_id
                          ? (() => {
                              const collector = collectors?.find((c) => c.id === formData.collector_id);
                              return collector ? `${collector.name} (${collector.collector_code})` : "Cari kolektor...";
                            })()
                          : "Cari kolektor..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Ketik nama atau kode kolektor..." />
                        <CommandList>
                          <CommandEmpty>Kolektor tidak ditemukan.</CommandEmpty>
                          <CommandGroup>
                            {collectors?.filter((c) => c.is_active !== false || c.id === formData.collector_id).map((collector) => (
                              <CommandItem
                                key={collector.id}
                                value={`${collector.name} ${collector.collector_code}`}
                                onSelect={() => {
                                  setFormData({ ...formData, collector_id: collector.id });
                                  setCollectorOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    formData.collector_id === collector.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {collector.name} ({collector.collector_code})
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground mt-1">
                    Kode kolektor akan tampil pada No Faktur kupon
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="start_date">
                      Tanggal Mulai <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="start_date"
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Kupon akan dibuat mulai dari tanggal ini
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(v) => setFormData({ ...formData, status: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Aktif</SelectItem>
                        <SelectItem value="completed">Selesai</SelectItem>
                        <SelectItem value="cancelled">Dibatalkan</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="product_type">
                      Jenis Produk <span className="text-gray-400 text-xs">(opsional)</span>
                    </Label>
                    <Textarea
                      id="product_type"
                      value={formData.product_type}
                      readOnly
                      placeholder="Otomatis terisi dari Daftar Barang / Produk di bawah"
                      className="max-h-40 resize-y overflow-auto bg-muted/40"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Otomatis mengikuti nama produk pada Daftar Barang / Produk.</p>
                  </div>
                  <div>
                    <Label htmlFor="tenor_days">
                      Tenor (Hari) <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="tenor_days"
                      type="number"
                      value={formData.tenor_days}
                      onChange={(e) => setFormData({ ...formData, tenor_days: e.target.value })}
                      placeholder="Contoh: 100"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="total_loan_amount">
                      Total Pinjaman <span className="text-red-500">*</span>
                    </Label>
                    <CurrencyInput
                      id="total_loan_amount"
                      value={formData.total_loan_amount}
                      onValueChange={(val) => setFormData({ ...formData, total_loan_amount: val || 0 })}
                      placeholder="Rp 500.000"
                    />
                  </div>
                  <div>
                    <Label htmlFor="daily_installment_amount">Cicilan Harian</Label>
                    <CurrencyInput
                      id="daily_installment_amount"
                      value={formData.daily_installment_amount || calculateInstallment()}
                      onValueChange={(val) => setFormData({ ...formData, daily_installment_amount: val || 0 })}
                      placeholder="Otomatis"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Otomatis: {formatRupiah(calculateInstallment())}
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="modal">
                      Modal Awal <span className="text-red-500">*</span>
                    </Label>
                    <CurrencyInput
                      id="modal"
                      value={formData.modal}
                      onValueChange={() => { /* read-only, dihitung otomatis */ }}
                      disabled
                      readOnly
                      placeholder="Rp 0"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Otomatis: Total Harga Produk + DP
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="dp">
                      DP (Down Payment) <span className="text-gray-400 text-xs">(opsional)</span>
                    </Label>
                    <CurrencyInput
                      id="dp"
                      value={formData.dp}
                      onValueChange={(val) => setFormData({ ...formData, dp: val || 0 })}
                      placeholder="Rp 0"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Modal efektif: {formatRupiah(Math.max(0, (formData.modal || 0) - (formData.dp || 0)))}
                    </p>
                  </div>
                </div>
                  <div>
                    <Label htmlFor="keuntungan">Keuntungan Harian (otomatis)</Label>
                    {(() => {
                      const tenor = parseInt(formData.tenor_days) || 0;
                      const modalEfektif = Math.max(0, (formData.modal || 0) - (formData.dp || 0));
                      const totalProfit = Math.max(0, (formData.total_loan_amount || 0) - modalEfektif);
                      const dailyProfit = tenor > 0 ? Math.round(totalProfit / tenor) : 0;
                      return (
                        <>
                          <CurrencyInput
                            id="keuntungan"
                            value={dailyProfit}
                            disabled
                            readOnly
                            placeholder="Rp 0 / hari"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Rumus: (Total Pinjaman − Modal Efektif) ÷ Tenor = ({formatRupiah(formData.total_loan_amount || 0)} − {formatRupiah(modalEfektif)}) ÷ {tenor || 0}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Total keuntungan = {formatRupiah(totalProfit)} ({tenor} hari)
                          </p>
                        </>
                      );
                    })()}
                  </div>

                  {/* ===== Daftar Barang / Produk ===== */}
                  <div className="pt-4 border-t space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Daftar Barang / Produk</Label>
                      {(() => {
                        const total = products.reduce((s, p) => s + (p.price || 0), 0);
                        return (
                          <span className="text-xs text-muted-foreground">
                            Total Harga Produk: {formatRupiah(total)}
                          </span>
                        );
                      })()}
                    </div>

                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">No</TableHead>
                            <TableHead>Nama</TableHead>
                            <TableHead className="text-right">Harga</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Toko</TableHead>
                            <TableHead>Tgl Ambil</TableHead>
                            <TableHead className="w-12"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {products.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-xs text-muted-foreground">
                                Belum ada produk. Tambahkan di bawah.
                              </TableCell>
                            </TableRow>
                          ) : (
                            products.map((p, i) => (
                              <TableRow key={i}>
                                <TableCell>{i + 1}</TableCell>
                                <TableCell className="font-medium">{p.name}</TableCell>
                                <TableCell className="text-right">{formatRupiah(p.price || 0)}</TableCell>
                                <TableCell>
                                  <Badge variant={p.status === 'hutang' ? 'destructive' : 'secondary'}>
                                    {p.status === 'hutang' ? 'Hutang' : 'Cash'}
                                  </Badge>
                                </TableCell>
                                <TableCell>{p.store || '-'}</TableCell>
                                <TableCell>
                                  <Input
                                    type="date"
                                    value={p.pickup_date || ''}
                                    onChange={(e) => handleUpdateProductPickup(i, e.target.value)}
                                    className="h-8 w-[150px]"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveProduct(i)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>


                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                      <div className="md:col-span-3">
                        <Label className="text-xs">Nama Barang</Label>
                        <Input
                          value={newProduct.name}
                          onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                          placeholder="Contoh: Kulkas"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-xs">Harga</Label>
                        <CurrencyInput
                          value={newProduct.price}
                          onValueChange={(val) => setNewProduct({ ...newProduct, price: val || 0 })}
                          placeholder="Rp 0"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-xs">Status</Label>
                        <Select
                          value={newProduct.status}
                          onValueChange={(v: 'hutang' | 'cash') => setNewProduct({ ...newProduct, status: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="hutang">Hutang</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-xs">Toko</Label>
                        <Popover open={productStorePopoverOpen} onOpenChange={setProductStorePopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={productStorePopoverOpen}
                              className="w-full justify-between font-normal"
                            >
                              <span className={cn("truncate", !newProduct.store && "text-muted-foreground")}>
                                {newProduct.store || "Pilih toko..."}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                            <Command
                              filter={(value, search) =>
                                value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                              }
                            >
                              <CommandInput
                                placeholder="Cari atau ketik toko baru..."
                                value={newProduct.store}
                                onValueChange={(v) => setNewProduct({ ...newProduct, store: v })}
                              />
                              <CommandList>
                                <CommandEmpty>
                                  <div className="text-xs text-muted-foreground py-1">
                                    Tekan Enter untuk pakai "{newProduct.store}" sebagai toko baru.
                                  </div>
                                </CommandEmpty>
                                <CommandGroup heading="Toko tersedia">
                                  {storeOptions.map((s) => (
                                    <CommandItem
                                      key={s}
                                      value={s}
                                      onSelect={(val) => {
                                        setNewProduct((p) => ({ ...p, store: val }));
                                        setProductStorePopoverOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          newProduct.store.trim().toLowerCase() === s.toLowerCase()
                                            ? "opacity-100"
                                            : "opacity-0"
                                        )}
                                      />
                                      {s}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-xs">Tgl Ambil</Label>
                        <Input
                          type="date"
                          value={newProduct.pickup_date || ''}
                          onChange={(e) => setNewProduct({ ...newProduct, pickup_date: e.target.value })}
                        />
                      </div>
                      <div className="md:col-span-1">
                        <Button type="button" onClick={handleAddProduct} className="w-full">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                  </div>
            </div>
          </div>
          
          
          <DialogFooter className="shrink-0 p-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            {/** New combined action: create+generate+print */}
            {!selectedContract && (
              <Button
                variant="secondary"
                onClick={handleCreateAndPrint}
                disabled={createContract.isPending || generateCoupons.isPending}
                className="mr-2"
              >
                <Printer className="mr-2 h-4 w-4" />
                Buat & Cetak Kupon
              </Button>
            )}
            <Button onClick={handleSubmit} disabled={createContract.isPending || updateContract.isPending || generateCoupons.isPending}>
              {selectedContract ? "Perbarui" : "Buat & Generate Kupon"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contract Detail Dialog - Progress & Info */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 p-6 pb-4">
            <DialogTitle>Detail Kontrak: {selectedContract?.contract_ref}</DialogTitle>
          </DialogHeader>
          
          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-6">
              <div className="space-y-6 pb-4">
                {selectedContract && (() => {
                  const progress = (selectedContract.current_installment_index / selectedContract.tenor_days) * 100;
                  const paidAmount = selectedContract.current_installment_index * selectedContract.daily_installment_amount;
                  const remainingAmount = (selectedContract.tenor_days - selectedContract.current_installment_index) * selectedContract.daily_installment_amount;
                  const createdAt = new Date(selectedContract.created_at);
                  const today = new Date();
                  const daysElapsed = Math.max(1, Math.floor((today.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));
                  const daysPerDue = selectedContract.current_installment_index > 0 
                    ? (daysElapsed / selectedContract.current_installment_index).toFixed(1) 
                    : "0";

                  return (
                    <>
                      {/* Customer & Contract Info */}
                      <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                        <div>
                          <p className="text-sm text-muted-foreground">Pelanggan</p>
                          <p className="font-medium">
                            {selectedContract.customers?.name}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">No. Faktur</p>
                          <p className="font-medium font-mono">{getNoFaktur(selectedContract.id)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Agen Sales</p>
                          <p className="font-medium">
                            {salesAgents?.find(a => a.id === selectedContract.sales_agent_id)?.name || "-"}
                            {(() => {
                              const agent = salesAgents?.find(a => a.id === selectedContract.sales_agent_id);
                              return agent?.agent_code ? <span className="ml-2 text-muted-foreground">({agent.agent_code})</span> : null;
                            })()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Tanggal Mulai</p>
                          <p className="font-medium">{selectedContract.start_date ? formatDate(selectedContract.start_date) : "-"}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Jenis Produk</p>
                          <p className="font-medium">{selectedContract.product_type || "-"}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Status</p>
                          <Badge variant={selectedContract.status === "active" ? "default" : "secondary"}>
                            {selectedContract.status === "active" ? "Aktif" : selectedContract.status}
                          </Badge>
                        </div>
                      </div>

                      {/* Financial Info */}
                      <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Pinjaman</p>
                          <p className="font-semibold text-lg">{formatRupiah(selectedContract.total_loan_amount)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Modal</p>
                          <p className="font-semibold text-lg">{formatRupiah((selectedContract.omset || 0) + ((selectedContract as any).dp || 0))}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">DP (Down Payment)</p>
                          <p className="font-semibold text-lg text-orange-600">{formatRupiah((selectedContract as any).dp || 0)}</p>
                        </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Keuntungan</p>
                            <p className="font-semibold text-lg">{formatRupiah((selectedContract.total_loan_amount || 0) - ((selectedContract.omset || 0) + ((selectedContract as any).dp || 0)))}</p>
                          </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Cicilan Harian</p>
                          <p className="font-medium">{formatRupiah(selectedContract.daily_installment_amount)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Tenor</p>
                          <p className="font-medium">{selectedContract.tenor_days} hari</p>
                        </div>
                      </div>

                      {/* Customer Contracts Table - show all contracts for this customer with payment summary */}
                      <div className="p-4 border rounded-lg">
                        <h4 className="font-semibold mb-3">Daftar Kontrak Pelanggan</h4>
                        {(() => {
                          const customerContracts = (contracts || []).filter(c => c.customer_id === selectedContract.customer_id);
                          if (!customerContracts || customerContracts.length === 0) {
                            return <div className="text-sm text-muted-foreground">Tidak ada kontrak lain untuk pelanggan ini.</div>;
                          }

                          return (
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/50">
                                      <TableHead className="text-sm">Kode</TableHead>
                                      <TableHead className="text-sm">Mulai</TableHead>
                                      <TableHead className="text-sm text-right">Tenor</TableHead>
                                      <TableHead className="text-sm text-right">Cicilan/Hari</TableHead>
                                      <TableHead className="text-sm text-center">Terbayar</TableHead>
                                      <TableHead className="text-sm text-center">Belum</TableHead>
                                      <TableHead className="text-sm text-right">Sisa</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {customerContracts.map((c) => {
                                    const paidCount = c.current_installment_index || 0;
                                    const totalCount = c.tenor_days || 0;
                                    const unpaidCount = Math.max(0, totalCount - paidCount);
                                    const perInstallment = c.daily_installment_amount || (c.total_loan_amount && totalCount ? Math.ceil(c.total_loan_amount / totalCount) : 0);
                                    const remainingAmount = unpaidCount * perInstallment;

                                    return (
                                      <TableRow key={c.id} className="hover:bg-muted/30">
                                        <TableCell className="py-2 text-sm font-medium">{c.contract_ref}</TableCell>
                                        <TableCell className="py-2 text-sm">{c.start_date ? new Date(c.start_date).toLocaleDateString('id-ID') : '-'}</TableCell>
                                        <TableCell className="py-2 text-right text-sm">{totalCount} hari</TableCell>
                                        <TableCell className="py-2 text-right text-sm">{formatRupiah(perInstallment)}</TableCell>
                                        <TableCell className="py-2 text-center text-sm">{paidCount}</TableCell>
                                        <TableCell className="py-2 text-center text-sm">{unpaidCount}</TableCell>
                                        <TableCell className="py-2 text-right text-sm">{formatRupiah(remainingAmount)}</TableCell>
                                        {/* aksi column removed */}
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Progress Section */}
                      <div className="p-4 border rounded-lg space-y-4">
                        <h4 className="font-semibold">Progress Pembayaran</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Cicilan ke-{selectedContract.current_installment_index} dari {selectedContract.tenor_days}</span>
                            <span className="font-medium">{progress.toFixed(1)}%</span>
                          </div>
                          <Progress value={progress} className="h-3" />
                        </div>
                        <div className="grid grid-cols-3 gap-4 pt-2">
                          <div className="text-center p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                            <p className="text-xs text-muted-foreground">Terbayar</p>
                            <p className="font-semibold text-green-600 dark:text-green-400">{formatRupiah(paidAmount)}</p>
                          </div>
                          <div className="text-center p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
                            <p className="text-xs text-muted-foreground">Sisa</p>
                            <p className="font-semibold text-orange-600 dark:text-orange-400">{formatRupiah(remainingAmount)}</p>
                          </div>
                          <div className="text-center p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                            <p className="text-xs text-muted-foreground">Rata-rata</p>
                            <p className="font-semibold text-blue-600 dark:text-blue-400">{daysPerDue} hari/cicilan</p>
                          </div>
                        </div>
                      </div>

                      {/* Print Coupons Section */}
                      <div className="flex justify-between items-center p-4 border rounded-lg">
                        <div>
                          <h4 className="font-semibold">Cetak Kupon</h4>
                          <p className="text-sm text-muted-foreground">{selectedContractCoupons?.length || 0} kupon tersedia</p>
                        </div>
                        <Button onClick={handlePrintAllCoupons} disabled={!selectedContractCoupons?.length}>
                          <Printer className="mr-2 h-4 w-4" />
                          Cetak Kupon (A4)
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </div>
          </div>
          
          <div className="shrink-0 p-6 pt-4 border-t flex justify-end">
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>Tutup</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Kontrak?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Semua kupon yang terkait juga akan dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteClick}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Return Confirmation */}
      <AlertDialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return Kontrak?</AlertDialogTitle>
            <AlertDialogDescription>
              Kontrak <b>{selectedContract?.contract_ref}</b> akan ditandai <b>Macet (Return)</b>.
              <br /><br />
              Dampak:
              <ul className="list-disc pl-5 mt-1 space-y-0.5">
                <li>Data kontrak <b>tetap tersimpan</b> sebagai riwayat.</li>
                <li>Sisa tagihan (kupon belum bayar) <b>dibatalkan</b> — outstanding berkurang.</li>
                <li>Omset, modal & komisi sales dari kontrak ini <b>tidak lagi dihitung</b>.</li>
                <li>Komisi yang sudah dibayar ke sales <b>tidak ditarik kembali</b>.</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleReturnClick} className="bg-destructive hover:bg-destructive/90">
              Ya, Return Kontrak
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Password Confirmation Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konfirmasi Password</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Masukkan password admin untuk melanjutkan operasi ini
            </p>
            <Input
              type="password"
              placeholder="Masukkan password..."
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
              autoFocus
            />
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setPasswordDialogOpen(false);
                setPasswordInput("");
                setPendingAction(null);
                setPendingPrintCoupons(null);
                setPendingPrintContract(null);
              }}
            >
              Batal
            </Button>
            <Button onClick={handlePasswordSubmit}>
              Verifikasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}