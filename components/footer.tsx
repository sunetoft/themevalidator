import Link from "next/link";
import { Zap } from "lucide-react";

const familySites = [
  { label: "BunnyStocks", href: "https://bunnystocks.com" },
  { label: "Warren", href: "https://warren.bunnystocks.com" },
  { label: "ThemeInvestor", href: "https://themeinvestor.bunnystocks.com" },
  { label: "OptionLookup", href: "https://optionlookup.bunnystocks.com" },
  { label: "HoldSell", href: "https://holdsell.bunnystocks.com" },
  { label: "TradeScouter", href: "https://tradescouter.bunnystocks.com" },
];

const internalLinks = [
  { label: "Themes", href: "/themes" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Pricing", href: "/pricing" },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-8 sm:flex-row sm:items-start">
          {/* Brand */}
          <div className="text-center sm:text-left">
            <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Zap className="h-5 w-5" />
              </span>
              <span className="gold-text font-display">ThemeInvestor</span>
            </Link>
            <p className="mt-2 text-sm text-muted-foreground">
              Part of the Bunnystocks family
            </p>
          </div>

          {/* Internal links */}
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {internalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-accent"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Family sites */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {familySites.map((site) => (
              <a
                key={site.href}
                href={site.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground transition-colors hover:text-accent"
              >
                {site.label}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-8 border-t border-border pt-6">
          <p className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} ThemeInvestor. For educational purposes only. Not financial advice.
          </p>
        </div>
      </div>
    </footer>
  );
}
