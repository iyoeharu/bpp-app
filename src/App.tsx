import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthProvider, useAuthContext } from "@/contexts/AuthContext";
import { AdminNoteProvider } from "@/contexts/AdminNoteContext";
import { useDatabaseKeepAlive } from "@/hooks/useDatabaseKeepAlive";

// Eager imports for frequently accessed/small pages
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Lazy imports for large pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const SalesAgents = lazy(() => import("./pages/SalesAgents"));
const Collectors = lazy(() => import("./pages/Collectors"));

const Customers = lazy(() => import("./pages/Customers"));
const Contracts = lazy(() => import("./pages/Contracts"));
const Collection = lazy(() => import("./pages/Collection"));

const CustomerHistory = lazy(() => import("./pages/CustomerHistory"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const Holidays = lazy(() => import("./pages/Holidays"));

const queryClient = new QueryClient();

// Loading component untuk Suspense
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
      <p className="text-muted-foreground">Memuat halaman...</p>
    </div>
  </div>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthContext();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

const AppRoutes = () => {
  const { isAuthenticated, isLoading } = useAuthContext();
  useDatabaseKeepAlive();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route 
        path="/auth" 
        element={isAuthenticated ? <Navigate to="/" replace /> : <Auth />} 
      />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/sales-agents" element={<SalesAgents />} />
                  <Route path="/collectors" element={<Collectors />} />
                  <Route path="/customers" element={<Customers />} />
                  <Route path="/contracts" element={<Contracts />} />
                  <Route path="/holidays" element={<Holidays />} />
                  <Route path="/collection" element={<Collection />} />
                  
                  <Route path="/history" element={<CustomerHistory />} />
                  <Route path="/audit-log" element={<AuditLog />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AdminNoteProvider>
            <AppRoutes />
          </AdminNoteProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
