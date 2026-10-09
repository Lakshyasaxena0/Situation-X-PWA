import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { History, MessageSquare, Menu, FlaskConical, LogOut, CreditCard, Gift, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SaturnXLogo } from "@/components/SaturnXLogo";
import { BrandName } from "@/components/BrandName";
import { FollowUpPrompt } from "@/components/FollowUpPrompt";
import { CreditBadge } from "@/components/CreditBadge";
import { InstallPrompt } from "@/components/InstallPrompt";
import { ReactNode, useState } from "react";

interface ShellProps {
  children: ReactNode;
}

export function Shell({ children }: ShellProps) {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { signOut } = useClerk();
  const { user } = useUser();

  const navItems = [
    { href: "/oracle", label: "Analysis", icon: FlaskConical },
    { href: "/history", label: "History", icon: History },
    { href: "/feedback", label: "Feedback", icon: MessageSquare },
    { href: "/pricing", label: "Plans & credits", icon: CreditCard },
    { href: "/invite", label: "Invite a friend", icon: Gift },
    { href: "/settings", label: "Settings", icon: SettingsIcon },
  ];

  function isActive(href: string) {
    return location === href || (href === "/oracle" && location === "/");
  }

  /** The only way the app signs you out: you stay signed in until you press this. */
  const LogoutButton = () => (
    <Button type="button" variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => signOut({ redirectUrl: "/" })}>
      <LogOut className="w-4 h-4" />
      Log out
    </Button>
  );

  const NavLinks = () => (
    <>
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setIsOpen(false)}
        >
          <div className={`flex items-center gap-3 px-3 py-2.5 rounded transition-all text-sm ${
            isActive(item.href)
              ? "bg-primary/15 text-foreground font-semibold border border-primary/40"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}>
            <item.icon className="w-4 h-4" />
            <span className="font-medium">{item.label}</span>
          </div>
        </Link>
      ))}
    </>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-background sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <SaturnXLogo size={28} />
          <BrandName />
        </div>
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-foreground">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[260px] bg-background border-border p-6 flex flex-col gap-6">
            <div className="flex items-center gap-2 mt-2">
              <SaturnXLogo size={32} />
              <BrandName />
            </div>
            <nav className="flex flex-col gap-1">
              <NavLinks />
            </nav>
            <CreditBadge />
            <div className="mt-auto pt-4 border-t border-border space-y-3">
              {user && <p className="text-xs text-muted-foreground truncate">{user.primaryEmailAddress?.emailAddress}</p>}
              <LogoutButton />
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-[220px] flex-col border-r border-border bg-background h-screen sticky top-0 shrink-0">
        <div className="px-5 py-5 flex items-center gap-2.5 border-b border-border">
          <SaturnXLogo size={30} />
          <BrandName />
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          <NavLinks />
        </nav>

        <div className="px-3 pb-3">
          <CreditBadge />
        </div>

        <div className="px-4 py-4 border-t border-border space-y-3">
          {user && <p className="text-xs text-muted-foreground truncate">{user.primaryEmailAddress?.emailAddress}</p>}
          <LogoutButton />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 max-w-full overflow-x-hidden">
        <InstallPrompt />
        <FollowUpPrompt />
        {children}
      </main>
    </div>
  );
}
