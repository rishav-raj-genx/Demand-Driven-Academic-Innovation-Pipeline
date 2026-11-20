"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ShieldCheck,
  ShieldAlert,
  LogOut,
  Menu,
  X,
  Building2,
  Briefcase,
  Compass,
  LayoutDashboard,
  CheckCircle2,
  Users,
} from "lucide-react";

export interface ShellUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isEmailVerified: boolean;
  verificationStatus: string;
  orgVerificationStatus?: string;
  institutionId?: string | null;
  industryPartnerId?: string | null;
  institution?: {
    name: string;
    code: string;
    verificationStatus: string;
  } | null;
  industryPartner?: {
    organizationName: string;
    cin?: string | null;
    verificationStatus: string;
  } | null;
}

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: [
      "STUDENT",
      "CITIZEN",
      "GOVT_OFFICIAL",
      "FACULTY",
      "RESEARCHER",
      "INSTITUTION_ADMIN",
      "HEI_ADMIN",
      "INDUSTRY_PARTNER",
      "INVESTOR",
      "CSR_PARTNER",
      "SUPER_ADMIN",
    ],
  },
  {
    label: "HEI Portal",
    href: "/hei",
    icon: Building2,
    roles: ["INSTITUTION_ADMIN", "HEI_ADMIN", "FACULTY", "RESEARCHER", "SUPER_ADMIN"],
  },
  {
    label: "Industry Hub",
    href: "/industry",
    icon: Briefcase,
    roles: ["INDUSTRY_PARTNER", "CSR_PARTNER", "INVESTOR", "SUPER_ADMIN"],
  },
  {
    label: "Challenges",
    href: "/challenges",
    icon: Compass,
    roles: [
      "STUDENT",
      "CITIZEN",
      "GOVT_OFFICIAL",
      "FACULTY",
      "RESEARCHER",
      "INSTITUTION_ADMIN",
      "HEI_ADMIN",
      "INDUSTRY_PARTNER",
      "SUPER_ADMIN",
    ],
  },
  {
    label: "Verify Org",
    href: "/onboarding/verify",
    icon: CheckCircle2,
    roles: ["INSTITUTION_ADMIN", "HEI_ADMIN", "INDUSTRY_PARTNER", "CSR_PARTNER", "SUPER_ADMIN"],
  },
  {
    label: "Admin Console",
    href: "/admin",
    icon: Users,
    roles: ["SUPER_ADMIN"],
  },
];

export function getAllowedNavItems(role?: string): NavItem[] {
  if (!role) return [];
  const normalizedRole = role === "HEI_ADMIN" ? "INSTITUTION_ADMIN" : role;
  return NAV_ITEMS.filter((item) =>
    item.roles.some((r) => r === role || r === normalizedRole)
  );
}

interface AppShellProps {
  children: React.ReactNode;
  initialUser?: ShellUser | null;
}

export function AppShell({ children, initialUser }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<ShellUser | null>(initialUser ?? null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (!initialUser) {
      fetch("/api/v1/auth/me")
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error("Unauthenticated");
        })
        .then((data) => {
          if (data.success && data.data?.user) {
            setUser(data.data.user);
          }
        })
        .catch(() => {
          setUser(null);
        });
    }
  }, [initialUser]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Proceed to logout
    } finally {
      setUser(null);
      router.push("/login");
      router.refresh();
    }
  };

  const navItems = getAllowedNavItems(user?.role);
  const isOrgVerified =
    user?.orgVerificationStatus === "VERIFIED" ||
    user?.verificationStatus === "VERIFIED" ||
    user?.institution?.verificationStatus === "VERIFIED" ||
    user?.industryPartner?.verificationStatus === "VERIFIED";

  const isOrgRole = [
    "INSTITUTION_ADMIN",
    "HEI_ADMIN",
    "INDUSTRY_PARTNER",
    "CSR_PARTNER",
  ].includes(user?.role ?? "");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Brand Logo */}
            <div className="flex items-center space-x-3">
              <Link
                href="/dashboard"
                className="flex items-center space-x-2 text-blue-400 hover:text-blue-300 font-bold text-lg tracking-tight focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
                aria-label="SIH 26043 Academic Innovation Pipeline Dashboard"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black text-sm shadow">
                  JH
                </div>
                <span>SIH26043 Pipeline</span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-1" aria-label="Main Navigation">
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      isActive
                        ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                        : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* User Profile & Actions */}
            <div className="hidden md:flex items-center space-x-4">
              {user ? (
                <>
                  {/* Role Badge */}
                  <div className="flex items-center space-x-2 bg-slate-800/80 border border-slate-700 rounded-full px-3 py-1 text-xs">
                    <span className="font-semibold text-slate-300">{user.fullName || user.email}</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-blue-400 font-mono">{user.role}</span>
                  </div>

                  {/* Org Verification Status Badge */}
                  {isOrgRole && (
                    <div
                      className={`flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        isOrgVerified
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                      }`}
                      title={
                        isOrgVerified
                          ? "Organization Verified (AISHE / MCA Validated)"
                          : "Pending AISHE / MCA Verification"
                      }
                    >
                      {isOrgVerified ? (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Verified Org</span>
                        </>
                      ) : (
                        <Link
                          href="/onboarding/verify"
                          className="flex items-center space-x-1 hover:underline focus:outline-none focus:ring-1 focus:ring-amber-400"
                        >
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                          <span>Verify Org</span>
                        </Link>
                      )}
                    </div>
                  )}

                  {/* Logout Button */}
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-300 hover:text-red-400 hover:bg-red-500/10 border border-slate-800 hover:border-red-500/30 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                    aria-label="Log out of account"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{isLoggingOut ? "Exiting..." : "Logout"}</span>
                  </button>
                </>
              ) : (
                <div className="flex items-center space-x-2">
                  <Link
                    href="/login"
                    className="px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/register"
                    className="px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-md transition shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Register
                  </Link>
                </div>
              )}
            </div>

            {/* Mobile Menu Button */}
            <div className="flex md:hidden items-center">
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-expanded={isMobileMenuOpen}
                aria-label="Toggle navigation menu"
              >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-b border-slate-800 bg-slate-900 px-4 pt-2 pb-4 space-y-2">
            {user && (
              <div className="pb-3 border-b border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-slate-200">{user.fullName || user.email}</div>
                  <div className="text-blue-400 font-mono">{user.role}</div>
                </div>
                {isOrgRole && (
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      isOrgVerified
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {isOrgVerified ? "VERIFIED" : "UNVERIFIED"}
                  </span>
                )}
              </div>
            )}

            <nav className="space-y-1" aria-label="Mobile Navigation">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {user ? (
              <div className="pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-red-400 hover:bg-red-500/10"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <Link
                  href="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block text-center px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 rounded"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block text-center px-4 py-2 text-sm bg-blue-600 text-white rounded font-medium"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main Page Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
