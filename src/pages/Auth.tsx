import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Home, KeyRound } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

// Validation schema
const authSchema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
});

export default function Auth() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuthContext();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  // Reset password dialog state
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetCurrentPassword, setResetCurrentPassword] = useState("");
  const [resetNewLoginPassword, setResetNewLoginPassword] = useState("");
  const [resetNewAdminPassword, setResetNewAdminPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // Check if already logged in via context
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, authLoading, navigate]);

  const validateForm = () => {
    try {
      authSchema.parse({ email, password });
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: { email?: string; password?: string } = {};
        error.errors.forEach((err) => {
          if (err.path[0] === "email") fieldErrors.email = err.message;
          if (err.path[0] === "password") fieldErrors.password = err.message;
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast.error("Email atau password salah");
        } else if (error.message.includes("Email not confirmed")) {
          toast.error("Email belum dikonfirmasi. Cek inbox Anda.");
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success("Login berhasil!");
      navigate("/");
    } catch (error) {
      toast.error("Terjadi kesalahan saat login");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim() || !resetCurrentPassword) {
      toast.error("Email dan password login saat ini harus diisi");
      return;
    }
    if (!resetNewLoginPassword && !resetNewAdminPassword) {
      toast.error("Isi minimal salah satu password baru");
      return;
    }
    if (resetNewLoginPassword && resetNewLoginPassword.length < 6) {
      toast.error("Password login baru minimal 6 karakter");
      return;
    }
    if (resetNewAdminPassword && resetNewAdminPassword.length < 6) {
      toast.error("Password admin baru minimal 6 karakter");
      return;
    }

    setResetLoading(true);
    try {
      // 1. Konfirmasi dengan password login saat ini
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: resetEmail.trim(),
        password: resetCurrentPassword,
      });
      if (signInError) {
        toast.error("Email atau password login saat ini salah");
        return;
      }

      // 2. Update password login (jika diisi)
      if (resetNewLoginPassword) {
        const { error: updErr } = await supabase.auth.updateUser({
          password: resetNewLoginPassword,
        });
        if (updErr) {
          toast.error("Gagal update password login: " + updErr.message);
          return;
        }
      }

      // 3. Update password admin di app_settings (jika diisi)
      if (resetNewAdminPassword) {
        const { error: adminErr } = await (supabase as any)
          .from("app_settings")
          .upsert(
            { key: "admin_password", value: resetNewAdminPassword, updated_at: new Date().toISOString() },
            { onConflict: "key" }
          );
        if (adminErr) {
          console.error("[ResetAdmin] upsert error", adminErr);
          toast.error("Gagal update password admin: " + (adminErr.message || JSON.stringify(adminErr)));
          return;
        }

        // Verifikasi: baca ulang nilai untuk memastikan benar tersimpan
        const { data: verifyData, error: verifyErr } = await (supabase as any)
          .from("app_settings")
          .select("value")
          .eq("key", "admin_password")
          .maybeSingle();
        if (verifyErr || !verifyData) {
          console.error("[ResetAdmin] verify error", verifyErr, verifyData);
          toast.error(
            "Password admin tidak terverifikasi tersimpan. Cek apakah tabel app_settings sudah ada."
          );
          return;
        }
        if (verifyData.value !== resetNewAdminPassword) {
          console.error("[ResetAdmin] mismatch", verifyData.value);
          toast.error("Password admin tersimpan tidak sesuai input. Hubungi developer.");
          return;
        }
        console.log("[ResetAdmin] password admin tersimpan OK");
      }

      // 4. Sign out supaya user login ulang dengan password baru
      await supabase.auth.signOut();

      toast.success("Password berhasil diperbarui. Silakan login kembali.");
      setResetOpen(false);
      setResetEmail("");
      setResetCurrentPassword("");
      setResetNewLoginPassword("");
      setResetNewAdminPassword("");
    } catch (err) {
      toast.error("Terjadi kesalahan saat reset password");
    } finally {
      setResetLoading(false);
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Home className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">CV MAHKOTA JAYA</CardTitle>
          <CardDescription>
            Sistem Manajemen Kredit
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Login
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setResetEmail(email);
                setResetOpen(true);
              }}
              disabled={isLoading}
            >
              <KeyRound className="mr-2 h-4 w-4" />
              Reset Password
            </Button>
            {import.meta.env.DEV && (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={async () => {
                  // DEV-ONLY: Mock login to test dashboard
                  try {
                    // Create mock session data
                    const mockSession = {
                      user: { id: 'dev-user-123', email: 'dev@test.local' },
                      access_token: 'dev-token',
                      expires_at: Date.now() + 24 * 60 * 60 * 1000,
                    };
                    // Store in localStorage (Supabase auth-js format)
                    localStorage.setItem(
                      'sb-hgmtzunpaqoczwshfeer-auth-token',
                      JSON.stringify(mockSession)
                    );
                    toast.success('Demo mode activated - redirecting to dashboard');
                    // Force page reload to trigger auth check
                    setTimeout(() => window.location.href = '/', 500);
                  } catch (error) {
                    toast.error('Demo mode failed');
                  }
                }}
              >
                🧪 Demo Mode (Dev Only)
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Konfirmasi dengan password login saat ini, lalu isi password baru yang ingin diubah.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                disabled={resetLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-current">Password Login Saat Ini (konfirmasi)</Label>
              <Input
                id="reset-current"
                type="password"
                placeholder="••••••••"
                value={resetCurrentPassword}
                onChange={(e) => setResetCurrentPassword(e.target.value)}
                disabled={resetLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-new-login">Password Login Baru (opsional)</Label>
              <Input
                id="reset-new-login"
                type="password"
                placeholder="Kosongkan jika tidak diubah"
                value={resetNewLoginPassword}
                onChange={(e) => setResetNewLoginPassword(e.target.value)}
                disabled={resetLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-new-admin">Password Admin Baru (opsional)</Label>
              <Input
                id="reset-new-admin"
                type="password"
                placeholder="Kosongkan jika tidak diubah"
                value={resetNewAdminPassword}
                onChange={(e) => setResetNewAdminPassword(e.target.value)}
                disabled={resetLoading}
              />
              <p className="text-xs text-muted-foreground">
                Password admin digunakan untuk verifikasi update/hapus/retur kontrak.
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetOpen(false)}
                disabled={resetLoading}
              >
                Batal
              </Button>
              <Button type="submit" disabled={resetLoading}>
                {resetLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Simpan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
