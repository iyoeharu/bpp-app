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
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AdminNotePromptOptions {
  /** Judul dialog */
  title?: string;
  /** Penjelasan singkat untuk admin */
  description?: string;
  /** Label tombol konfirmasi */
  confirmLabel?: string;
  /** Variant tombol konfirmasi */
  variant?: "default" | "destructive";
  /** Wajib masukkan password user yang sedang login untuk konfirmasi */
  requirePassword?: boolean;
}

type Resolver = (value: string | null) => void;

interface AdminNoteContextValue {
  promptAdminNote: (options?: AdminNotePromptOptions) => Promise<string | null>;
}

const AdminNoteContext = createContext<AdminNoteContextValue | null>(null);

export function AdminNoteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [options, setOptions] = useState<AdminNotePromptOptions>({});
  const resolverRef = useRef<Resolver | null>(null);

  const promptAdminNote = useCallback(
    (opts: AdminNotePromptOptions = {}) =>
      new Promise<string | null>((resolve) => {
        resolverRef.current = resolve;
        setOptions(opts);
        setNote("");
        setPassword("");
        setOpen(true);
      }),
    [],
  );

  const handleClose = (value: string | null) => {
    setOpen(false);
    setPassword("");
    const resolver = resolverRef.current;
    resolverRef.current = null;
    resolver?.(value);
  };

  const verifyPassword = async (pwd: string): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      toast.error("Sesi login tidak ditemukan");
      return false;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: pwd,
    });
    return !error;
  };

  const handleConfirm = async () => {
    const trimmed = note.trim();
    if (!trimmed) return;
    if (options.requirePassword) {
      if (!password.trim()) {
        toast.error("Password wajib diisi");
        return;
      }
      setVerifying(true);
      try {
        const ok = await verifyPassword(password);
        if (!ok) {
          toast.error("Password salah");
          setPassword("");
          return;
        }
      } finally {
        setVerifying(false);
      }
    }
    handleClose(trimmed);
  };

  return (
    <AdminNoteContext.Provider value={{ promptAdminNote }}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o && !verifying) handleClose(null);
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
          <div className="space-y-3">
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
            {options.requirePassword && (
              <div className="space-y-2">
                <Label htmlFor="admin-password">
                  Password <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password login Anda"
                  autoComplete="current-password"
                />
                <p className="text-xs text-muted-foreground">
                  Gunakan password akun login Anda untuk konfirmasi.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleClose(null)} disabled={verifying}>
              Batal
            </Button>
            <Button
              variant={options.variant ?? "default"}
              onClick={handleConfirm}
              disabled={
                note.trim().length === 0 ||
                verifying ||
                (options.requirePassword && password.trim().length === 0)
              }
            >
              {verifying ? "Memverifikasi…" : options.confirmLabel ?? "Lanjutkan"}
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
