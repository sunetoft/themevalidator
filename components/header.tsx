"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Zap,
  LayoutDashboard,
  ListChecks,
  TrendingUp,
  LogOut,
  Sun,
  Moon,
  Users,
  Crown,
  Globe,
  Shield,
  Menu,
  X,
  Settings,
  UserCircle2,
  ChevronDown,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";

export default function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const isAdmin = (session?.user as any)?.role === "admin";
  const hasSub = (session?.user as any)?.hasSubscription;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Main nav links (content navigation)
  const navLinks = [
    { href: "/themes", label: "Themes", icon: Globe },
    { href: "/strategies", label: "Strategies", icon: ListChecks },
    { href: "/paper-trades", label: "Paper Trades", icon: TrendingUp },
  ];

  // User dropdown items
  const userMenuLinks = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/settings", label: "User Settings", icon: Settings },
    ...(isAdmin ? [{ href: "/admin", label: "Admin Panel", icon: Shield }] : []),
    ...(isAdmin ? [{ href: "/users", label: "User Management", icon: Users }] : []),
  ];

  const linkClass = (href: string) =>
    cn(
      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
      pathname.startsWith(href)
        ? "text-accent"
        : "text-muted-foreground hover:text-foreground hover:bg-muted",
    );

  const userInitial = (session?.user as any)?.name?.charAt(0)?.toUpperCase() ||
    (session?.user as any)?.email?.charAt(0)?.toUpperCase() || "U";

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-lg">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo + main nav */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Zap className="h-5 w-5" />
            </span>
            <span className="gold-text font-display">ThemeInvestor</span>
          </Link>

          {session && (
            <div className="hidden items-center gap-1 md:flex">
              {navLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link key={link.href} href={link.href} className={linkClass(link.href)}>
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Right side actions */}
        <div className="hidden items-center gap-3 md:flex">
          {!session && (
            <>
              <Link
                href="/themes"
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Browse Themes
              </Link>
              <Link
                href="/pricing"
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Pricing
              </Link>
              <Link
                href="/auth"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:brightness-110"
              >
                Sign In
              </Link>
            </>
          )}

          {session && (
            <>
              {!hasSub && !isAdmin && (
                <Link
                  href="/pricing"
                  className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
                >
                  <Crown className="h-4 w-4" />
                  Upgrade
                </Link>
              )}

              {isAdmin && (
                <Link
                  href="/analyze"
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:brightness-110"
                >
                  + New Analysis
                </Link>
              )}

              {hasSub && (
                <span className="flex items-center gap-1 rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent">
                  <Crown className="h-3.5 w-3.5" />
                  Pro
                </span>
              )}

              {/* Theme toggle */}
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                aria-label="Toggle theme"
              >
                <Sun className="h-4 w-4 dark:hidden" />
                <Moon className="hidden h-4 w-4 dark:block" />
              </button>

              {/* User icon with dropdown */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg p-1 transition-colors hover:bg-muted",
                    userMenuOpen && "bg-muted",
                  )}
                  aria-label="User menu"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {userInitial}
                  </span>
                  <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", userMenuOpen && "rotate-180")} />
                </button>

                {/* Dropdown menu */}
                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-60 overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/20">
                    {/* User info header */}
                    <div className="border-b border-border px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
                          {userInitial}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {(session?.user as any)?.name || "User"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {(session?.user as any)?.email}
                          </p>
                        </div>
                      </div>
                      {isAdmin && (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                          <Shield className="h-3 w-3" />
                          Administrator
                        </span>
                      )}
                    </div>

                    {/* Menu links */}
                    <div className="py-1">
                      {userMenuLinks.map((link) => {
                        const Icon = link.icon;
                        const active = pathname.startsWith(link.href);
                        return (
                          <Link
                            key={link.href}
                            href={link.href}
                            onClick={() => setUserMenuOpen(false)}
                            className={cn(
                              "flex items-center gap-3 px-4 py-2 text-sm font-medium transition-colors",
                              active
                                ? "bg-accent/10 text-accent"
                                : "text-foreground hover:bg-muted",
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            {link.label}
                          </Link>
                        );
                      })}
                    </div>

                    {/* Sign out */}
                    <div className="border-t border-border py-1">
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          signOut({ callbackUrl: "/themes" });
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-foreground md:hidden"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {/* Mobile menu (logged in) */}
      {mobileOpen && session && (
        <div className="border-t border-border bg-card px-4 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-2 text-sm font-medium transition-colors hover:text-accent",
                    pathname.startsWith(link.href) ? "text-accent" : "text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
            <div className="my-2 border-t border-border" />
            {/* User menu links in mobile */}
            <Link
              href="/dashboard"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
            <Link
              href="/settings"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <Settings className="h-4 w-4" />
              User Settings
            </Link>
            {isAdmin && (
              <>
                <Link
                  href="/admin"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 text-sm font-medium text-foreground"
                >
                  <Shield className="h-4 w-4" />
                  Admin Panel
                </Link>
                <Link
                  href="/users"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 text-sm font-medium text-foreground"
                >
                  <Users className="h-4 w-4" />
                  User Management
                </Link>
              </>
            )}
            <div className="my-2 border-t border-border" />
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex items-center gap-2 text-sm font-medium text-foreground"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              Toggle Theme
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/themes" })}
              className="flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Mobile menu (not logged in) */}
      {mobileOpen && !session && (
        <div className="border-t border-border bg-card px-4 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            <Link href="/themes" onClick={() => setMobileOpen(false)} className="text-sm font-medium text-foreground">
              Browse Themes
            </Link>
            <Link href="/pricing" onClick={() => setMobileOpen(false)} className="text-sm font-medium text-foreground">
              Pricing
            </Link>
            <Link
              href="/auth"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg bg-accent px-4 py-2 text-center text-sm font-semibold text-accent-foreground"
            >
              Sign In
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
