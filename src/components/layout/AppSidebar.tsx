import { useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  UserCircle,
  FileText,
  Wallet,
  
  History,
  LogOut,
  Shield,
  Calendar,
  Receipt,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
];

const masterItems = [
  { title: "Agen Sales", url: "/sales-agents", icon: Users },
  { title: "Gaji Karyawan", url: "/collectors", icon: Users },
  { title: "Pelanggan", url: "/customers", icon: UserCircle },
  { title: "Kontrak", url: "/contracts", icon: FileText },
  { title: "Hari Libur", url: "/holidays", icon: Calendar },
];

const operationItems = [
  { title: "Penagihan", url: "/collection", icon: Wallet },
  { title: "Nota Belanja", url: "/nota-belanja", icon: Receipt },
  { title: "Riwayat Pelanggan", url: "/history", icon: History },
];

const systemItems = [
  { title: "Log Audit", url: "/audit-log", icon: Shield },
];

export function AppSidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const isActive = (path: string) => location.pathname === path;

  return (
    <Sidebar className="border-r print:hidden">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Utama
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url}>
                      <item.icon className="mr-2 h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Master Data
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {masterItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url}>
                      <item.icon className="mr-2 h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Operasi
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {operationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url}>
                      <item.icon className="mr-2 h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sistem
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url}>
                      <item.icon className="mr-2 h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground truncate">
            {user?.email}
          </p>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={signOut}
            className="w-full"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Keluar
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
