import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Plus, Pencil, Trash, Wallet, ArrowLeft, ChevronRight, UserX } from "lucide-react";
import { toast } from "sonner";
import { useAdminNote } from "@/contexts/AdminNoteContext";
import { format, startOfMonth, addMonths, subMonths } from "date-fns";
import { id as idLocale } from "date-fns/locale";

import { Button } from "@/components/ui/button";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CurrencyInput } from "@/components/ui/currency-input";
import { SearchInput } from "@/components/ui/search-input";
import { TablePagination } from "@/components/TablePagination";
import { usePagination } from "@/hooks/usePagination";
import { formatRupiah } from "@/lib/format";
import {
  useCollectors,
  useCreateCollector,
  useUpdateCollector,
  useDeleteCollector,
  Collector,
} from "@/hooks/useCollectors";
import {
  useCollectorSalaries,
  useSetCollectorSalary,
  useCollectorSalaryTotal,
} from "@/hooks/useCollectorSalaries";
import {
  useStaffSalaries,
  useSetStaffSalary,
  useDeleteStaffSalary,
  useStaffSalaryTotal,
  useStaffPositionsRegistry,
  StaffSalaryRow,
} from "@/hooks/useStaffSalaries";

const ITEMS_PER_PAGE = 10;

export default function Collectors() {
  const { t } = useTranslation();
  const { promptAdminNote } = useAdminNote();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("highlightId");

  const { data: collectors, isLoading } = useCollectors();
  const createCollector = useCreateCollector();
  const updateCollector = useUpdateCollector();
  const deleteCollector = useDeleteCollector();

  // Bulan terpilih untuk gaji
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));
  const { data: salaryMap } = useCollectorSalaries(selectedMonth);
  const totalSalary = useCollectorSalaryTotal(selectedMonth);
  const setSalary = useSetCollectorSalary();

  // Gaji posisi lain (string-based)
  const { data: staffSalaries } = useStaffSalaries(selectedMonth);
  const { data: positionRegistry } = useStaffPositionsRegistry();
  const totalStaffSalary = useStaffSalaryTotal(selectedMonth);
  const setStaffSalary = useSetStaffSalary();
  const deleteStaffSalary = useDeleteStaffSalary();
  const [staffDialogOpen, setStaffDialogOpen] = useState(false);
  const [staffEditTarget, setStaffEditTarget] = useState<StaffSalaryRow | null>(null);
  // Saat row "virtual" (posisi dari registry, belum ada baris bulan ini),
  // posisi & nama tetap di-lock — admin hanya mengisi nominal.
  const [staffLocked, setStaffLocked] = useState(false);
  const [staffPosition, setStaffPosition] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffAmount, setStaffAmount] = useState<number>(0);

  // Gabungan: baris gaji bulan ini + posisi dari registry yg belum diisi bulan ini.
  // Virtual rows (id null) artinya posisi sudah pernah ada — admin tinggal isi nominal.
  type MergedStaffRow = {
    id: string | null;
    position: string;
    name: string;
    amount: number;
    isVirtual: boolean;
  };
  const mergedStaffRows: MergedStaffRow[] = (() => {
    const map = new Map<string, MergedStaffRow>();
    (staffSalaries || []).forEach((r) => {
      map.set(r.position.toLowerCase(), {
        id: r.id,
        position: r.position,
        name: r.name || "",
        amount: r.amount,
        isVirtual: false,
      });
    });
    (positionRegistry || []).forEach((r) => {
      const key = r.position.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          id: null,
          position: r.position,
          name: r.name,
          amount: 0,
          isVirtual: true,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.position.localeCompare(b.position));
  })();

  const handleOpenStaffCreate = () => {
    setStaffEditTarget(null);
    setStaffLocked(false);
    setStaffPosition("");
    setStaffName("");
    setStaffAmount(0);
    setStaffDialogOpen(true);
  };
  const handleOpenStaffEdit = (row: StaffSalaryRow) => {
    setStaffEditTarget(row);
    setStaffLocked(true);
    setStaffPosition(row.position);
    setStaffName(row.name || "");
    setStaffAmount(row.amount);
    setStaffDialogOpen(true);
  };
  // Untuk baris virtual (posisi dari registry, belum ada baris bulan ini)
  const handleOpenStaffVirtual = (position: string, name: string) => {
    setStaffEditTarget(null);
    setStaffLocked(true);
    setStaffPosition(position);
    setStaffName(name);
    setStaffAmount(0);
    setStaffDialogOpen(true);
  };
  const handleSaveStaff = async () => {
    const pos = staffPosition.trim();
    const nm = staffName.trim();
    if (!pos) {
      toast.error("Nama posisi wajib diisi");
      return;
    }
    if (!nm) {
      toast.error("Nama karyawan wajib diisi");
      return;
    }
    // Cek duplikasi posisi (kecuali saat edit row yg sama)
    const dup = (staffSalaries || []).find(
      (r) => r.position.toLowerCase() === pos.toLowerCase() && r.id !== staffEditTarget?.id
    );
    if (dup) {
      toast.error(`Posisi "${pos}" sudah ada bulan ini`);
      return;
    }
    await setStaffSalary.mutateAsync({
      id: staffEditTarget?.id,
      position: pos,
      name: nm,
      amount: staffAmount || 0,
      month: selectedMonth,
    });
    setStaffDialogOpen(false);
  };
  const handleDeleteStaff = async (row: StaffSalaryRow) => {
    await deleteStaffSalary.mutateAsync(row.id);
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [salaryDialogOpen, setSalaryDialogOpen] = useState(false);
  const [salaryEditTarget, setSalaryEditTarget] = useState<Collector | null>(null);
  const [salaryAmount, setSalaryAmount] = useState<number>(0);
  const [selectedCollector, setSelectedCollector] = useState<Collector | null>(null);
  const [highlightedRow, setHighlightedRow] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    collector_code: "",
    name: "",
    phone: "",
    salary: 0,
  });

  // Filter collectors based on search query
  const filteredCollectors = collectors?.filter((collector) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      collector.name.toLowerCase().includes(query) ||
      collector.collector_code.toLowerCase().includes(query) ||
      collector.phone?.toLowerCase().includes(query)
    );
  }) || [];

  // Pagination
  const {
    paginatedItems,
    currentPage,
    goToPage,
    totalPages,
    totalItems,
  } = usePagination(filteredCollectors, ITEMS_PER_PAGE);

  // Highlight effect for navigation from other pages
  useEffect(() => {
    if (highlightId && collectors) {
      setHighlightedRow(highlightId);
      const element = document.getElementById(`collector-row-${highlightId}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      const timer = setTimeout(() => setHighlightedRow(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightId, collectors]);

  const handlePrevMonth = () => setSelectedMonth((prev) => startOfMonth(subMonths(prev, 1)));
  const handleNextMonth = () => setSelectedMonth((prev) => startOfMonth(addMonths(prev, 1)));

  const handleOpenCreate = () => {
    // Generate next collector code based on the most recent pattern
    const generateNextCode = () => {
      if (!collectors || collectors.length === 0) return "K001";
      const sortedCollectors = [...collectors].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const recentCode = sortedCollectors[0]?.collector_code;
      if (!recentCode) return "K001";
      const match = recentCode.match(/^([A-Z]+)(\d+)$/);
      if (!match) return "K001";
      const prefix = match[1];
      const numberLength = match[2].length;
      const existingNumbers = collectors
        .map(c => c.collector_code)
        .filter(code => code.startsWith(prefix))
        .map(code => {
          const numMatch = code.match(new RegExp(`^${prefix}(\\d+)$`));
          return numMatch ? parseInt(numMatch[1], 10) : 0;
        })
        .filter(num => !isNaN(num));
      const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
      const nextNumber = maxNumber + 1;
      return `${prefix}${nextNumber.toString().padStart(numberLength, '0')}`;
    };

    setFormData({
      collector_code: generateNextCode(),
      name: "",
      phone: "",
      salary: 0,
    });
    setSelectedCollector(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (collector: Collector) => {
    setFormData({
      collector_code: collector.collector_code,
      name: collector.name,
      phone: collector.phone || "",
      salary: salaryMap?.get(collector.id)?.amount ?? 0,
    });
    setSelectedCollector(collector);
    setDialogOpen(true);
  };

  const handleOpenDelete = (collector: Collector) => {
    setSelectedCollector(collector);
    setDeleteDialogOpen(true);
  };

  const handleOpenSalaryEdit = (collector: Collector) => {
    setSalaryEditTarget(collector);
    setSalaryAmount(salaryMap?.get(collector.id)?.amount ?? 0);
    setSalaryDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.collector_code.trim() || !formData.name.trim()) {
      toast.error("Kode dan nama kolektor wajib diisi");
      return;
    }

    try {
      let savedCollector: Collector | null = null;
      if (selectedCollector) {
        const note = await promptAdminNote({
          title: "Catatan Pembaruan Kolektor",
          description: `Tuliskan alasan perubahan data kolektor ${selectedCollector.name}.`,
          requirePassword: true,
        });
        if (!note) return;
        const updated = await updateCollector.mutateAsync({
          id: selectedCollector.id,
          collector_code: formData.collector_code,
          name: formData.name,
          phone: formData.phone || null,
          _note: note,
        });
        savedCollector = (updated as any).data as Collector;
        toast.success("Kolektor berhasil diperbarui");
      } else {
        const created = await createCollector.mutateAsync({
          collector_code: formData.collector_code,
          name: formData.name,
          phone: formData.phone || null,
        });
        savedCollector = created as Collector;
        toast.success("Kolektor berhasil ditambahkan");
      }

      // Simpan gaji bulan terpilih jika diisi/diubah
      if (savedCollector) {
        const currentSalary = salaryMap?.get(savedCollector.id)?.amount ?? 0;
        if ((formData.salary || 0) !== currentSalary) {
          await setSalary.mutateAsync({
            collector_id: savedCollector.id,
            collector_name: savedCollector.name,
            amount: formData.salary || 0,
            month: selectedMonth,
          });
        }
      }

      setDialogOpen(false);
    } catch (error) {
      toast.error("Gagal menyimpan data kolektor");
    }
  };

  const handleSaveSalary = async () => {
    if (!salaryEditTarget) return;
    await setSalary.mutateAsync({
      collector_id: salaryEditTarget.id,
      collector_name: salaryEditTarget.name,
      amount: salaryAmount || 0,
      month: selectedMonth,
    });
    setSalaryDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!selectedCollector) return;
    try {
      const note = await promptAdminNote({
        title: "Catatan Hapus Kolektor",
        description: `Tuliskan alasan menghapus kolektor ${selectedCollector.name}.`,
        confirmLabel: "Hapus",
        variant: "destructive",
        requirePassword: true,
      });
      if (!note) return;
      await deleteCollector.mutateAsync({ id: selectedCollector.id, _note: note });
      toast.success("Kolektor berhasil dihapus");
      setDeleteDialogOpen(false);
    } catch (error) {
      toast.error("Gagal menghapus kolektor");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold">Gaji Karyawan</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Month Selector */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={handlePrevMonth}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="px-3 py-2 bg-muted rounded-md text-sm font-medium min-w-[140px] text-center">
              {format(selectedMonth, "MMMM yyyy", { locale: idLocale })}
            </div>
            <Button variant="outline" size="icon" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={handleOpenCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Kolektor Baru
          </Button>
        </div>
      </div>

      {/* Salary summary card */}
      <div className="rounded-lg border bg-orange-50 dark:bg-orange-900/10 px-4 py-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-orange-500/15 flex items-center justify-center">
          <Wallet className="h-5 w-5 text-orange-600" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Total Gaji Kolektor — {format(selectedMonth, "MMMM yyyy", { locale: idLocale })}</p>
          <p className="text-lg font-bold text-orange-700 dark:text-orange-400">{formatRupiah(totalSalary)}</p>
        </div>
        <p className="text-xs text-muted-foreground max-w-xs text-right">
          Otomatis terkalkulasi sebagai biaya operasional di Dashboard bulanan & rekap tahunan.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Cari kolektor berdasarkan nama, kode, atau telepon..."
          className="max-w-md"
        />
        <div className="text-sm text-muted-foreground">
          Menampilkan {totalItems} dari {collectors?.length || 0} kolektor
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Kode</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>No. Telepon</TableHead>
              <TableHead className="text-right">Gaji Bulan Ini</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <div className="h-8 bg-muted animate-pulse rounded" />
                  </TableCell>
                </TableRow>
              ))
            ) : paginatedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {searchQuery
                    ? `Tidak ada kolektor dengan kata kunci "${searchQuery}"`
                    : "Belum ada data kolektor"}
                </TableCell>
              </TableRow>
            ) : (
              paginatedItems.map((collector, index) => {
                const salary = salaryMap?.get(collector.id)?.amount ?? 0;
                return (
                  <TableRow
                    key={collector.id}
                    id={`collector-row-${collector.id}`}
                    className={
                      highlightedRow === collector.id
                        ? "bg-primary/10 transition-colors duration-300"
                        : ""
                    }
                  >
                    <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{collector.collector_code}</Badge>
                        {collector.is_active === false && (
                          <Badge variant="outline" className="text-xs gap-1 border-destructive/40 text-destructive">
                            <UserX className="h-3 w-3" /> Nonaktif
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{collector.name}</TableCell>
                    <TableCell>{collector.phone || "-"}</TableCell>
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenSalaryEdit(collector)}
                        className={`font-semibold hover:underline ${salary > 0 ? "text-orange-600" : "text-muted-foreground"}`}
                        title="Klik untuk ubah gaji bulan ini"
                      >
                        {formatRupiah(salary)}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={collector.is_active === false ? "Aktifkan kembali" : "Tandai tidak bekerja"}
                          onClick={async () => {
                            const willDeactivate = collector.is_active !== false;
                            const note = await promptAdminNote({
                              title: willDeactivate ? "Catatan Nonaktifkan Kolektor" : "Catatan Aktifkan Kolektor",
                              description: `Tuliskan alasan ${willDeactivate ? "menonaktifkan" : "mengaktifkan kembali"} kolektor ${collector.name}.`,
                            });
                            if (!note) return;
                            updateCollector.mutate({ id: collector.id, is_active: !willDeactivate, _note: note } as any);
                          }}
                        >
                          <UserX className={`h-4 w-4 ${collector.is_active === false ? 'text-muted-foreground' : 'text-destructive'}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(collector)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDelete(collector)}
                        >
                          <Trash className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={goToPage}
          totalItems={totalItems}
        />
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedCollector ? "Edit Kolektor" : "Kolektor Baru"}
            </DialogTitle>
            <DialogDescription>
              {selectedCollector
                ? "Perbarui informasi kolektor"
                : "Tambahkan kolektor baru ke sistem"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="collector_code">Kode Kolektor *</Label>
              <Input
                id="collector_code"
                value={formData.collector_code}
                onChange={(e) =>
                  setFormData({ ...formData, collector_code: e.target.value })
                }
                placeholder="Contoh: K001, KOL001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nama *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Nama lengkap kolektor"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">No. Telepon</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                placeholder="08xxxxxxxxxx"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="salary">
                Gaji {format(selectedMonth, "MMMM yyyy", { locale: idLocale })}
              </Label>
              <CurrencyInput
                id="salary"
                value={formData.salary}
                onValueChange={(val) => setFormData({ ...formData, salary: val || 0 })}
                placeholder="Rp 0"
              />
              <p className="text-xs text-muted-foreground">
                Gaji disimpan per bulan & otomatis dikurangkan dari keuntungan dashboard.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createCollector.isPending || updateCollector.isPending || setSalary.isPending}
            >
              {createCollector.isPending || updateCollector.isPending || setSalary.isPending
                ? "Menyimpan..."
                : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Salary-only edit dialog (klik di kolom Gaji) */}
      <Dialog open={salaryDialogOpen} onOpenChange={setSalaryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Ubah Gaji — {salaryEditTarget?.name}
            </DialogTitle>
            <DialogDescription>
              Bulan: {format(selectedMonth, "MMMM yyyy", { locale: idLocale })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Gaji Bulan Ini</Label>
              <CurrencyInput
                value={salaryAmount}
                onValueChange={(val) => setSalaryAmount(val || 0)}
                placeholder="Rp 0"
              />
              <p className="text-xs text-muted-foreground">
                Set ke Rp 0 untuk menghapus catatan gaji bulan ini.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSalaryDialogOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleSaveSalary} disabled={setSalary.isPending}>
              {setSalary.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Kolektor?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus kolektor{" "}
              <strong>{selectedCollector?.name}</strong>? Tindakan ini tidak dapat
              dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCollector.isPending ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== Gaji Posisi Lain ===== */}
      <div className="space-y-3 pt-4 border-t">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-xl font-bold">Gaji Posisi Lainnya</h3>
          <Button onClick={handleOpenStaffCreate} variant="outline">
            <Plus className="mr-2 h-4 w-4" /> Tambah Posisi
          </Button>
        </div>

        <div className="rounded-lg border bg-blue-50 dark:bg-blue-900/10 px-4 py-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-blue-500/15 flex items-center justify-center">
            <Wallet className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">
              Total Gaji Posisi Lain — {format(selectedMonth, "MMMM yyyy", { locale: idLocale })}
            </p>
            <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{formatRupiah(totalStaffSalary)}</p>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Posisi / Jabatan</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead className="text-right">Gaji Bulan Ini</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mergedStaffRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Belum ada posisi karyawan. Klik "Tambah Posisi" untuk membuat.
                  </TableCell>
                </TableRow>
              ) : (
                mergedStaffRows.map((row, i) => (
                  <TableRow key={row.id ?? `virtual-${row.position}`}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{row.position}</TableCell>
                    <TableCell>{row.name || "-"}</TableCell>
                    <TableCell className="text-right">
                      {row.isVirtual ? (
                        <button
                          type="button"
                          onClick={() => handleOpenStaffVirtual(row.position, row.name)}
                          className="text-muted-foreground italic hover:underline"
                          title="Posisi tersimpan dari bulan sebelumnya — klik untuk mengisi nominal gaji bulan ini"
                        >
                          Belum diisi
                        </button>
                      ) : (
                        <span className="font-semibold text-blue-600">{formatRupiah(row.amount)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {row.isVirtual ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Isi nominal gaji bulan ini"
                            onClick={() => handleOpenStaffVirtual(row.position, row.name)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                handleOpenStaffEdit({
                                  id: row.id!,
                                  position: row.position,
                                  name: row.name,
                                  amount: row.amount,
                                  notes: null,
                                })
                              }
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                handleDeleteStaff({
                                  id: row.id!,
                                  position: row.position,
                                  name: row.name,
                                  amount: row.amount,
                                  notes: null,
                                })
                              }
                            >
                              <Trash className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={staffDialogOpen} onOpenChange={setStaffDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {staffEditTarget ? "Edit Gaji Posisi" : "Tambah Gaji Posisi"}
            </DialogTitle>
            <DialogDescription>
              Bulan: {format(selectedMonth, "MMMM yyyy", { locale: idLocale })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nama Posisi / Jabatan *</Label>
              <Input
                value={staffPosition}
                onChange={(e) => setStaffPosition(e.target.value)}
                placeholder="Contoh: Admin, Manajer, Sekretaris"
                disabled={staffLocked}
              />
              {staffLocked && (
                <p className="text-xs text-muted-foreground">
                  Posisi sudah permanen dari bulan sebelumnya. Hanya nominal gaji yang dapat diperbarui.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Nama Karyawan *</Label>
              <Input
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="Contoh: Budi Santoso"
                disabled={staffLocked}
              />
            </div>

            <div className="space-y-2">
              <Label>Gaji Bulan Ini</Label>
              <CurrencyInput
                value={staffAmount}
                onValueChange={(val) => setStaffAmount(val || 0)}
                placeholder="Rp 0"
              />
              <p className="text-xs text-muted-foreground">
                Otomatis dihitung sebagai Gaji karyawan di Dashboard. Posisi & nama akan tetap muncul di bulan-bulan berikutnya — Anda cukup mengisi nominal.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStaffDialogOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleSaveStaff} disabled={setStaffSalary.isPending}>
              {setStaffSalary.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
