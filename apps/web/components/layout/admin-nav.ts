import {
  Landmark,
  Coins,
  Globe,
  Map as MapIcon,
  Briefcase,
  Users,
  KeyRound,
  ShieldCheck,
  Sliders,
  LinkIcon,
  Package,
  Database,
  ClipboardCheck,
  Activity,
  Sparkles,
  Mail,
  Lock,
  PlugZap,
  ScrollText,
  BarChart3,
  Route,
  Target,
  type LucideIcon,
} from "lucide-react"

export interface AdminNavItem {
  name: string
  href: string
  icon: LucideIcon
}

export interface AdminNavSection {
  /** Uppercase text label in the sidebar; title-case name on the landing card. */
  label: string
  /** Leading icon for the landing-page section card (not shown in the sidebar header). */
  icon: LucideIcon
  /** Verbatim landing-card description. */
  description: string
  items: AdminNavItem[]
}

// The single source of truth for the admin sections — consumed by the sidebar
// (grouped nav) and the admin landing page (section cards). Group order is
// foundational → operational; within a group, highest-frequency first (SOW/brief).
export const adminSections: AdminNavSection[] = [
  {
    label: "Organization",
    icon: Landmark,
    description: "Organisation, entities, business units, finance",
    items: [
      { name: "Organisation", href: "/admin/organisation", icon: Landmark },
      { name: "Entities", href: "/admin/entities", icon: Globe },
      { name: "Regions", href: "/admin/regions", icon: MapIcon },
      { name: "Business Units", href: "/admin/business-units", icon: Briefcase },
      { name: "Sales Targets", href: "/admin/targets", icon: Target },
      { name: "Finance", href: "/admin/finance", icon: Coins },
    ],
  },
  {
    label: "Access & Security",
    icon: Lock,
    description: "Users, roles and permissions, allowed domains",
    items: [
      { name: "Users", href: "/admin/users", icon: Users },
      { name: "Roles & Permissions", href: "/admin/roles", icon: KeyRound },
      { name: "Allowed Domains", href: "/admin/allowed-domains", icon: ShieldCheck },
      { name: "Audit Log", href: "/admin/audit", icon: ScrollText },
    ],
  },
  {
    label: "Data",
    icon: Database,
    description: "Custom fields, products, relationship types, data management",
    items: [
      { name: "Custom Fields", href: "/admin/field-definitions", icon: Sliders },
      { name: "Products", href: "/admin/products", icon: Package },
      { name: "Relationship Types", href: "/admin/relationship-types", icon: LinkIcon },
      { name: "Data Management", href: "/admin/data-management", icon: Database },
    ],
  },
  {
    label: "Automation & AI",
    icon: Sparkles,
    description: "Sales process, approval workflows, deal health, AI",
    items: [
      { name: "Sales Process", href: "/admin/sales-process", icon: Route },
      { name: "Approval Workflows", href: "/admin/approval-workflows", icon: ClipboardCheck },
      { name: "Deal Health", href: "/admin/deal-health", icon: Activity },
      { name: "AI", href: "/admin/ai", icon: Sparkles },
      { name: "AI Usage", href: "/admin/ai-usage", icon: BarChart3 },
    ],
  },
  {
    label: "Integrations",
    icon: PlugZap,
    description: "Email, and connected tools as they're added",
    items: [{ name: "Email", href: "/admin/email", icon: Mail }],
  },
]
