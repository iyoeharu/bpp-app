import { useState, useEffect, useRef } from "react";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAdminNote } from "@/contexts/AdminNoteContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  useCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  CustomerWithRelations,
} from "@/hooks/useCustomers";

import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { SearchInput } from "@/components/ui/search-input";

export default function Customers() {
  const { t } = useTranslation();
  const { promptAdminNote } = useAdminNote();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const { data: customers, isLoading } = useCustomers();
  
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithRelations | null>(null);
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Filter customers based on search query
  const filteredCustomers = customers?.filter(customer =>
    customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (customer.nik || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (customer.phone || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (customer.address || '').toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // Sorting for customers
  const [customerSort, setCustomerSort] = useState<string>('name_asc');
  const sortedCustomers = (() => {
    const arr = [...filteredCustomers];
    switch (customerSort) {
      case 'name_asc':
        return arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      case 'name_desc':
        return arr.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
      case 'phone_asc':
        return arr.sort((a, b) => (a.phone || '').localeCompare(b.phone || ''));
      case 'newest':
        return arr.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      case 'oldest':
        return arr.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
      default:
        return arr;
    }
  })();
  
  const ITEMS_PER_PAGE = 5;
  const { currentPage, totalPages, paginatedItems, goToPage, totalItems } = usePagination(sortedCustomers, ITEMS_PER_PAGE);
  const [formData, setFormData] = useState({
    name: "",
    nik: "",
    address: "",
    business_address: "",
    phone: "",
  });

  // Handle highlighting item from global search
  useEffect(() => {
    if (highlightId && customers?.length) {
      const targetCustomer = customers.find(c => c.id === highlightId);
      if (targetCustomer) {
        setHighlightedRowId(highlightId);
        
        // Find the page where this customer is located in filtered results
        const customerIndex = filteredCustomers.findIndex(c => c.id === highlightId);
        if (customerIndex === -1) {
          // Customer not found in filtered results, clear search to show all
          setSearchQuery("");
          // Use original customers array if not found in filtered results
          const originalIndex = customers.findIndex(c => c.id === highlightId);
          const targetPage = Math.floor(originalIndex / 5) + 1;
          if (targetPage !== currentPage) {
            goToPage(targetPage);
          }
        } else {
          const targetPage = Math.floor(customerIndex / 5) + 1;
          // Navigate to the correct page
          if (targetPage !== currentPage) {
            goToPage(targetPage);
          }
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
  }, [highlightId, customers, filteredCustomers, currentPage, goToPage, searchParams, setSearchParams, setSearchQuery]);

  const handleOpenCreate = () => {
    setSelectedCustomer(null);
    setFormData({ name: "", nik: "", address: "", business_address: "", phone: "" });
    setDialogOpen(true);
  };

  const handleOpenEdit = (customer: CustomerWithRelations) => {
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name,
      nik: customer.nik || "",
      address: customer.address || "",
      business_address: (customer as any).business_address || "",
      phone: customer.phone || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (redirectToContract = false) => {
    // Validate required fields
    if (!formData.name.trim()) {
      toast.error(t("errors.nameRequired", "Nama customer wajib diisi"));
      return;
    }
    // Validate NIK format if provided (optional, but must be 16 digits if filled)
    if (formData.nik.trim() && formData.nik.trim().length !== 16) {
      toast.error("NIK harus 16 digit jika diisi");
      return;
    }
    if (formData.nik.trim() && !/^\d{16}$/.test(formData.nik.trim())) {
      toast.error("NIK harus berisi 16 digit angka");
      return;
    }
    
    // Validate phone number (required)
    if (!formData.phone.trim()) {
      toast.error("Nomor telepon wajib diisi");
      return;
    }
    if (!/^[\d\+\-\s\(\)]+$/.test(formData.phone.trim())) {
      toast.error("Format nomor telepon tidak valid");
      return;
    }
    
    try {
      const submitData = {
        name: formData.name.trim(),
        nik: formData.nik.trim() || null,
        address: formData.address.trim() || null,
        business_address: formData.business_address.trim() || null,
        phone: formData.phone.trim(),
      };
      
      if (selectedCustomer) {
        const note = await promptAdminNote({
          title: "Catatan Pembaruan Customer",
          description: `Tuliskan alasan perubahan data customer ${selectedCustomer.name}.`,
        });
        if (!note) return;
        await updateCustomer.mutateAsync({ id: selectedCustomer.id, ...submitData, _note: note } as any);
        toast.success(t("success.updated", "Data berhasil diperbarui"));
      } else {
        const newCustomer = await createCustomer.mutateAsync(submitData);
        toast.success(t("success.created", "Customer berhasil ditambahkan"));
        
        if (redirectToContract && newCustomer?.id) {
          setDialogOpen(false);
          navigate(`/contracts?newCustomerId=${newCustomer.id}`);
          return;
        }
      }
      setDialogOpen(false);
    } catch (error: any) {
      if (error?.message?.includes('duplicate') || error?.code === '23505') {
        if (error?.message?.includes('nik') || error?.message?.includes('unique_nik')) {
          toast.error("NIK sudah digunakan oleh customer lain");
        } else {
          toast.error("Kode customer sudah digunakan");
        }
      } else if (error?.message?.includes('check_nik_format')) {
        toast.error("NIK harus berisi 16 digit angka");
      } else {
        toast.error("Gagal menyimpan data. Silakan coba lagi.");
      }
    }
  };

  const handleDelete = async () => {
    if (!selectedCustomer) return;
    try {
      const note = await promptAdminNote({
        title: "Catatan Hapus Customer",
        description: `Tuliskan alasan menghapus customer ${selectedCustomer.name}.`,
        confirmLabel: "Hapus",
        variant: "destructive",
      });
      if (!note) return;
      await deleteCustomer.mutateAsync({ id: selectedCustomer.id, _note: note });
      toast.success(t("success.deleted"));
      setDeleteDialogOpen(false);
    } catch (error) {
      toast.error(t("errors.deleteFailed"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">{t("customers.title")}</h2>
        <Button onClick={handleOpenCreate}>
          <Plus className="mr-2 h-4 w-4" /> {t("customers.newCustomer")}
        </Button>
      </div>

      {/* Search Input */}
      <div className="space-y-4">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Cari customer berdasarkan nama, kode, NIK, telepon, atau alamat..."
          className="mt-1"
          onClear={() => setSearchQuery("")}
        />
        <div className="flex items-center gap-3">
          <div className="w-56">
            <Select onValueChange={(v) => setCustomerSort(v)} defaultValue={customerSort}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Urutkan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name_asc">Nama A → Z</SelectItem>
                <SelectItem value="name_desc">Nama Z → A</SelectItem>
                <SelectItem value="phone_asc">No. HP (A → Z)</SelectItem>
                <SelectItem value="newest">Pelanggan Baru</SelectItem>
                <SelectItem value="oldest">Pelanggan Lama</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="text-sm text-gray-500">
          {searchQuery ? (
            <span>
              Ditemukan <strong>{totalItems}</strong> dari {customers?.length || 0} customer
            </span>
          ) : (
            <span>
              Total <strong>{customers?.length || 0}</strong> customer
            </span>
          )}
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">{t("customers.name")}</TableHead>
                <TableHead className="min-w-[140px]">{t("customers.nik")}</TableHead>
                <TableHead className="min-w-[130px]">{t("customers.phone")}</TableHead>
                <TableHead className="min-w-[200px]">Alamat</TableHead>
                <TableHead className="text-right min-w-[100px]">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">{t("common.loading")}</TableCell>
                </TableRow>
              ) : filteredCustomers?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {searchQuery ? `Tidak ada customer yang ditemukan dengan kata kunci "${searchQuery}"` : t("common.noData")}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedItems.map((customer) => (
                  <TableRow 
                    key={customer.id}
                    ref={highlightedRowId === customer.id ? highlightedRowRef : null}
                    className={cn(
                      "hover:bg-muted/50",
                      highlightedRowId === customer.id && "bg-yellow-100 border-yellow-300 animate-pulse"
                    )}
                  >
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">
                        {customer.nik || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {customer.phone ? (
                        <a href={`tel:${customer.phone}`} className="text-blue-600 hover:underline">
                          {customer.phone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={customer.address || ''}>
                      {customer.address || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(customer)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={goToPage}
          totalItems={totalItems}
        />
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedCustomer ? t("customers.editCustomer") : t("customers.newCustomer")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">{t("customers.name")} *</Label>
              {(() => {
                const normalized = formData.phone.replace(/\D/g, '');
                const existingByPhone = !selectedCustomer && normalized.length >= 6
                  ? customers?.find((c) => (c.phone || '').replace(/\D/g, '') === normalized)
                  : null;
                const namePlaceholder = existingByPhone ? existingByPhone.name : t("customers.name");
                return (
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={namePlaceholder}
                  />
                );
              })()}
            </div>
            <div>
              <Label htmlFor="nik">{t("customers.nik")}</Label>
              <Input
                id="nik"
                value={formData.nik}
                onChange={(e) => {
                  // Only allow numbers and limit to 16 digits
                  const value = e.target.value.replace(/\D/g, '').slice(0, 16);
                  setFormData({ ...formData, nik: value });
                }}
                placeholder="Masukkan 16 digit NIK"
                maxLength={16}
                pattern="[0-9]{16}"
                className={cn(
                  formData.nik && formData.nik.length !== 16 && "border-destructive focus:border-destructive"
                )}
                required
              />
              {formData.nik && (
                <p className={cn(
                  "text-xs mt-1",
                  formData.nik.length === 16 ? 'text-green-600' : 'text-muted-foreground'
                )}>
                  {formData.nik.length === 16 ? '✓ NIK valid (16 digit)' : `${formData.nik.length}/16 digit`}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="phone">{t("customers.phone")} *</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => {
                  // Allow numbers, +, -, spaces, and parentheses
                  const value = e.target.value.replace(/[^\d\+\-\s\(\)]/g, '');
                  setFormData({ ...formData, phone: value });
                }}
                placeholder="e.g., 08123456789"
                maxLength={20}
              />
              {(() => {
                // Hanya untuk mode create (bukan edit) & nomor minimal 6 digit
                if (selectedCustomer) return null;
                const normalized = formData.phone.replace(/\D/g, '');
                if (normalized.length < 6) return null;
                const existing = customers?.find(
                  (c) => (c.phone || '').replace(/\D/g, '') === normalized
                );
                if (!existing) return null;
                return (
                  <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs dark:border-amber-700 dark:bg-amber-950">
                    <span className="text-amber-800 dark:text-amber-200">
                      Nomor sudah terdaftar atas nama: <strong>{existing.name}</strong>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        setDialogOpen(false);
                        toast.success(`Menggunakan data ${existing.name}`);
                        navigate(`/contracts?newCustomerId=${existing.id}`);
                      }}
                    >
                      Gunakan data & Buat Kontrak
                    </Button>
                  </div>
                );
              })()}
            </div>
            <div className="col-span-2">
              <Label htmlFor="address">{t("customers.address")} (Alamat Tinggal)</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Masukkan alamat tinggal customer..."
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="business_address">Alamat Usaha *</Label>
              <Textarea
                id="business_address"
                value={formData.business_address}
                onChange={(e) => setFormData({ ...formData, business_address: e.target.value })}
                placeholder="Masukkan alamat lokasi usaha (akan ditampilkan di kupon)..."
                rows={2}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Alamat ini akan ditampilkan pada kupon angsuran
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel", "Batal")}
            </Button>
            {!selectedCustomer && (
              <Button 
                variant="secondary"
                onClick={() => handleSubmit(true)} 
                disabled={createCustomer.isPending || updateCustomer.isPending}
              >
                <FileText className="mr-2 h-4 w-4" />
                {createCustomer.isPending ? "..." : "Simpan & Buat Kontrak"}
              </Button>
            )}
            <Button 
              onClick={() => handleSubmit(false)} 
              disabled={createCustomer.isPending || updateCustomer.isPending}
              className="min-w-[80px]"
            >
              {createCustomer.isPending || updateCustomer.isPending 
                ? "..." 
                : selectedCustomer 
                  ? t("common.save", "Simpan") 
                  : t("common.create", "Tambah")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus customer "{selectedCustomer?.name}"? 
              <br />
              <strong className="text-destructive">
                Tindakan ini tidak dapat dibatalkan dan akan menghapus semua data terkait.
              </strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteCustomer.isPending}
            >
              {deleteCustomer.isPending ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}