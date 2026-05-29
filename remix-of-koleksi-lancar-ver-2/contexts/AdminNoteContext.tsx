import { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export interface AdminNotePromptOptions {
  /** Judul dialog */
  title?: string;
  /** Penjelasan singkat untuk admin */
  description?: string;
  /** Label tombol konfirmasi */
  confirmLabel?: string;
  /** Variant tombol konfirmasi */
  variant?: "default" | "destructive";
}

type Resolver = (value: string | null) => void;

interface AdminNoteContextValue {
  /**
   * Buka popup catatan wajib. Resolve string catatan jika admin konfirmasi,
   * resolve `null` jika dibatalkan.
   */
  promptAdminNote: (options?: AdminNotePromptOptions) => Promise<string | null>;
}

const AdminNoteContext = createContext<AdminNoteContextValue | null>(null);

export function AdminNoteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [options, setOptions] = useState<AdminNotePromptOptions>({});
  const resolverRef = useRef<Resolver | null>(null);

  const promptAdminNote = useCallback(
    (opts: AdminNotePromptOptions = {}) =>
      new Promise<string | null>((resolve) => {
        resolverRef.current = resolve;
        setOptions(opts);
        setNote("");
        setOpen(true);
      }),
    [],
  );

  const handleClose = (value: string | null) => {
    setOpen(false);
    const resolver = resolverRef.current;
    resolverRef.current = null;
    resolver?.(value);
  };

  const handleConfirm = () => {
    const trimmed = note.trim();
    if (!trimmed) return; // tombol harus tetap disabled, ini guard
    handleClose(trimmed);
  };

  return (
    <AdminNoteContext.Provider value={{ promptAdminNote }}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) handleClose(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{options.title ?? "Catatan Admin Wajib"}</DialogTitle>
            <DialogDescription>
              {options.description ??
                "Tuliskan alasan / catatan untuk aktivitas ini. Catatan akan disimpan di Audit Log."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="admin-note">
              Catatan <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="admin-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contoh: Perbaikan kesalahan input nominal kontrak…"
              rows={4}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleClose(null)}>
              Batal
            </Button>
            <Button
              variant={options.variant ?? "default"}
              onClick={handleConfirm}
              disabled={note.trim().length === 0}
            >
              {options.confirmLabel ?? "Lanjutkan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminNoteContext.Provider>
  );
}

export function useAdminNote() {
  const ctx = useContext(AdminNoteContext);
  if (!ctx) {
    throw new Error("useAdminNote must be used within <AdminNoteProvider>");
  }
  return ctx;
}
