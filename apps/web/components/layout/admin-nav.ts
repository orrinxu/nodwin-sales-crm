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
  Database,
  ClipboardCheck,
  Activity,
  Sparkles,
  Mail,
  Lock,
  PlugZap,
  ScrollText,
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
    description: "Custom fields, relationship types, data management",
    items: [
      { name: "Custom Fields", href: "/admin/field-definitions", icon: Sliders },
      { name: "Relationship Types", href: "/admin/relationship-types", icon: LinkIcon },
      { name: "Data Management", href: "/admin/data-management", icon: Database },
    ],
  },
  {
    label: "Automation & AI",
    icon: Sparkles,
    description: "Approval workflows, deal health, AI",
    items: [
      { name: "Approval Workflows", href: "/admin/approval-workflows", icon: ClipboardCheck },
      { name: "Deal Health", href: "/admin/deal-health", icon: Activity },
      { name: "AI", href: "/admin/ai", icon: Sparkles },
    ],
  },
  {
    label: "Integrations",
    icon: PlugZap,
    description: "Email, and connected tools as they're added",
    items: [{ name: "Email", href: "/admin/email", icon: Mail }],
  },
]
