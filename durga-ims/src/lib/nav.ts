import {
  LayoutDashboard,
  Users,
  Truck,
  Package,
  Ruler,
  Percent,
  HardHat,
  ShoppingCart,
  ClipboardList,
  ClipboardCheck,
  FileText,
  BarChart2,
  Settings,
  Building2,
  Warehouse,
  Layers,
  ShieldCheck,
  IndianRupee,
} from "lucide-react";

// Single source of truth for the app navigation, shared by the desktop sidebar
// (components/sidebar.tsx) and the mobile drawer (components/mobile-nav.tsx).
// Role filtering (adminOnly) must be applied identically in both consumers.

export interface NavLeaf {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
}

export interface NavItem {
  label: string;
  href?: string;
  icon: typeof LayoutDashboard;
  children?: NavLeaf[];
  adminOnly?: boolean;
}

export const nav: NavItem[] = [
  {
    label: "Home",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Admin",
    icon: ShieldCheck,
    adminOnly: true,
    children: [
      { label: "Material Rate Master", href: "/admin/material-rates", icon: IndianRupee },
    ],
  },
  {
    label: "Masters",
    icon: Package,
    children: [
      { label: "Customers", href: "/masters/customers", icon: Users },
      { label: "Vehicle", href: "/masters/vehicles", icon: Truck },
      { label: "Suppliers", href: "/masters/suppliers", icon: Building2 },
      { label: "Materials", href: "/masters/materials", icon: Package },
      { label: "Units", href: "/masters/units", icon: Ruler },
      { label: "Tax Rates", href: "/masters/tax", icon: Percent },
      { label: "Stages", href: "/masters/stages", icon: Layers },
      { label: "Contractors", href: "/masters/contractors", icon: HardHat },
    ],
  },
  {
    label: "Transactions",
    icon: ShoppingCart,
    children: [
      { label: "Purchase Orders", href: "/transactions/purchase-orders", icon: ShoppingCart },
      { label: "Veh. Issue (Old)", href: "/transactions/material-issues", icon: ClipboardList },
      { label: "Veh. Issue (New)", href: "/transactions/material-issues/new", icon: ClipboardCheck },
    ],
  },
  { label: "Invoice", href: "/invoice", icon: FileText },
  { label: "Stock", href: "/stock", icon: Warehouse },
  { label: "Reports", href: "/reports", icon: BarChart2 },
  { label: "Settings", href: "/settings", icon: Settings },
];
