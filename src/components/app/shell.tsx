"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Bell,
  Check,
  ChevronsUpDown,
  FileCheck2,
  Gauge,
  History,
  LayoutList,
  ListChecks,
  Menu,
  Monitor,
  Moon,
  Search,
  Settings,
  ShieldAlert,
  Sun,
  X,
  BookOpen,
  LogOut,
  User,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/dates";
import { Logo } from "./logo";
import { Avatar, Kbd } from "./primitives";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/overlays";
import { logoutAction } from "@/features/auth/actions";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  notificationsSnapshotAction,
  type NotificationItem,
} from "@/features/notifications/actions";
import { CommandPalette } from "./command-palette";

export type ShellProps = {
  org: { slug: string; name: string; isDemo: boolean };
  user: { name: string; email: string };
  role: string;
  orgs: { slug: string; name: string; role: string; isDemo: boolean }[];
  counts: { evidenceToReview: number; myOpenTasks: number };
  unread: number;
  permissions: { canManageSettings: boolean; canCreateTask: boolean; canUploadEvidence: boolean; canManageControls: boolean };
  children: React.ReactNode;
};

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; count?: string | null };

function useNav(slug: string, counts: ShellProps["counts"]) {
  const base = `/org/${slug}`;
  const groups: { label: string; items: NavItem[] }[] = [
    { label: "Overview", items: [{ href: `${base}/dashboard`, label: "Dashboard", icon: Gauge }] },
    {
      label: "Compliance",
      items: [
        { href: `${base}/frameworks`, label: "Frameworks", icon: BookOpen },
        { href: `${base}/controls`, label: "Controls", icon: LayoutList },
        {
          href: `${base}/evidence`,
          label: "Evidence",
          icon: FileCheck2,
          count: counts.evidenceToReview > 0 ? `${counts.evidenceToReview} to review` : null,
        },
      ],
    },
    {
      label: "Work",
      items: [
        { href: `${base}/tasks`, label: "Tasks", icon: ListChecks, count: counts.myOpenTasks > 0 ? `${counts.myOpenTasks} mine` : null },
        { href: `${base}/risks`, label: "Risks & Gaps", icon: ShieldAlert },
      ],
    },
    { label: "Governance", items: [{ href: `${base}/audit-log`, label: "Audit log", icon: History }] },
  ];
  return { groups, settings: { href: `${base}/settings`, label: "Settings", icon: Settings } satisfies NavItem };
}

function NavLink({ item, active, collapsed, onNavigate }: { item: NavItem; active: boolean; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-sm px-2 text-[13px]",
        active ? "bg-accent-subtle font-medium text-foreground" : "text-muted-foreground hover:bg-hover hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-accent" : "")} />
      {!collapsed ? (
        <>
          <span className="truncate">{item.label}</span>
          {item.count ? <span className="ml-auto text-xs whitespace-nowrap text-muted-foreground tabular-nums">{item.count}</span> : null}
        </>
      ) : (
        <span className="sr-only">{item.label}</span>
      )}
    </Link>
  );
}

function Sidebar({ slug, counts, collapsed, onNavigate }: { slug: string; counts: ShellProps["counts"]; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { groups, settings } = useNav(slug, counts);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-4 px-2 py-3">
      {groups.map((g) => (
        <div key={g.label}>
          {!collapsed ? <p className="mb-1 px-2 text-[11px] font-medium tracking-wide text-faint-foreground uppercase">{g.label}</p> : null}
          <div className="flex flex-col gap-0.5">
            {g.items.map((i) => (
              <NavLink key={i.href} item={i} active={isActive(i.href)} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ))}
      <div className="mt-auto">
        <NavLink item={settings} active={isActive(settings.href)} collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </nav>
  );
}

function OrgSwitcher({ current, orgs }: { current: ShellProps["org"]; orgs: ShellProps["orgs"] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-8 max-w-56 items-center gap-2 rounded-sm px-2 text-[13px] font-medium hover:bg-hover" aria-label="Switch organization">
          <span className="truncate">{current.name}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {orgs.map((o) => (
          <DropdownMenuItem key={o.slug} asChild>
            <Link href={`/org/${o.slug}/dashboard`}>
              <span className="truncate">{o.name}</span>
              {o.isDemo ? <span className="text-xs text-faint-foreground">demo</span> : null}
              {o.slug === current.slug ? <Check className="ml-auto" /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding?new=1">Create organization</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Theme">
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-36">
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => setTheme(o.value)}>
            <o.icon />
            {o.label}
            {theme === o.value ? <Check className="ml-auto" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationBell({ slug, initialUnread }: { slug: string; initialUnread: number }) {
  const [unread, setUnread] = React.useState(initialUnread);
  const [items, setItems] = React.useState<NotificationItem[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Server-rendered count wins whenever the layout re-renders with a new value.
  const [prevInitial, setPrevInitial] = React.useState(initialUnread);
  if (prevInitial !== initialUnread) {
    setPrevInitial(initialUnread);
    setUnread(initialUnread);
  }

  const load = React.useCallback(() => {
    return notificationsSnapshotAction(slug).then((result) => {
      if (result.ok) {
        setUnread(result.data.unread);
        setItems(result.data.items);
      }
    });
  }, [slug]);

  // Refresh on navigation and poll every 60 seconds (no websockets).
  React.useEffect(() => {
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);
  React.useEffect(() => {
    let cancelled = false;
    notificationsSnapshotAction(slug).then((result) => {
      if (!cancelled && result.ok) {
        setUnread(result.data.unread);
        setItems(result.data.items);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, slug]);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void load();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} className="relative">
          <Bell />
          {unread > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-accent px-1 text-[10px] leading-4 font-medium text-accent-foreground tabular-nums">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-[13px] font-medium">Notifications</p>
          <button
            className="text-xs text-accent hover:underline disabled:opacity-50"
            disabled={unread === 0}
            onClick={async () => {
              const r = await markAllNotificationsReadAction(slug);
              if (r.ok) {
                setUnread(0);
                setItems((cur) => cur?.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })) ?? null);
              } else toast.error(r.error.message);
            }}
          >
            Mark all read
          </button>
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {items === null ? (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</li>
          ) : items.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">No notifications yet.</li>
          ) : (
            items.map((n) => (
              <li key={n.id} className="border-b border-border last:border-0">
                <button
                  className="flex w-full gap-2 px-3 py-2.5 text-left hover:bg-hover"
                  onClick={async () => {
                    if (!n.readAt) {
                      await markNotificationReadAction(slug, n.id);
                      setUnread((u) => Math.max(0, u - 1));
                    }
                    setOpen(false);
                    router.push(n.linkPath);
                  }}
                >
                  <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent")} aria-hidden />
                  <span className="min-w-0">
                    <span className={cn("block text-[13px]", !n.readAt && "font-medium")}>{n.title}</span>
                    {n.body ? <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span> : null}
                    <span className="mt-0.5 block text-[11px] text-faint-foreground">{formatRelative(new Date(n.createdAt))}</span>
                  </span>
                  {!n.readAt ? <span className="sr-only">Unread</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="border-t border-border px-3 py-2 text-center">
          <Link href={`/org/${slug}/notifications`} className="text-xs text-accent hover:underline" onClick={() => setOpen(false)}>
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function UserMenu({ user, role }: { user: ShellProps["user"]; role: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center rounded-full" aria-label="Account menu">
          <Avatar name={user.name} className="size-7 text-[11px]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <div className="px-2 py-1.5">
          <p className="truncate text-[13px] font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{role}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <User />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/security">
            <Settings />
            Security and sessions
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const SIDEBAR_KEY = "audittrail.sidebar";
const SIDEBAR_EVENT = "audittrail:sidebar";

function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function subscribeSidebar(callback: () => void) {
  window.addEventListener(SIDEBAR_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(SIDEBAR_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** Per-viewer convenience stored in localStorage (server render: expanded). */
function useSidebarCollapsed(): boolean {
  return React.useSyncExternalStore(subscribeSidebar, readSidebarCollapsed, () => false);
}

function setSidebarCollapsed(value: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, value ? "collapsed" : "expanded");
  } catch {
    // Storage unavailable: the preference simply is not remembered.
  }
  window.dispatchEvent(new Event(SIDEBAR_EVENT));
}

export function AppShell(props: ShellProps) {
  const { org, user, role, orgs, counts, unread, permissions, children } = props;
  const collapsed = useSidebarCollapsed();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleCollapsed = () => setSidebarCollapsed(!collapsed);


  return (
    <div className="flex min-h-dvh flex-col">
      {org.isDemo ? (
        <div className="border-b border-border bg-subtle px-4 py-1.5 text-center text-xs text-muted-foreground" role="note">
          <span className="font-medium text-foreground">Demo workspace</span> · sample data · not a real audit result
        </div>
      ) : null}
      <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-background px-3">
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
          <Menu />
        </Button>
        <Link href={`/org/${org.slug}/dashboard`} className="hidden items-center md:flex" aria-label="AuditTrail home">
          <Logo />
        </Link>
        <span className="hidden text-border-strong md:inline">/</span>
        <OrgSwitcher current={org} orgs={orgs} />
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden h-8 w-64 items-center gap-2 rounded-sm border border-border px-2 text-[13px] text-muted-foreground hover:bg-hover sm:flex"
            aria-label="Search and commands"
          >
            <Search className="size-4" />
            <span>Search…</span>
            <span className="ml-auto flex gap-0.5">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Search" onClick={() => setPaletteOpen(true)}>
            <Search />
          </Button>
          <NotificationBell slug={org.slug} initialUnread={unread} />
          <ThemeToggle />
          <UserMenu user={user} role={role} />
        </div>
      </header>
      <div className="flex flex-1">
        <aside className={cn("sticky top-12 hidden h-[calc(100dvh-3rem)] shrink-0 flex-col border-r border-border md:flex", collapsed ? "w-14" : "w-56")}>
          <div className="flex-1 overflow-y-auto">
            <Sidebar slug={org.slug} counts={counts} collapsed={collapsed} />
          </div>
          <button
            onClick={toggleCollapsed}
            className="flex h-9 items-center justify-center gap-2 border-t border-border text-xs text-muted-foreground hover:bg-hover hover:text-foreground"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </aside>
        {mobileOpen ? (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-64 border-r border-border bg-background">
              <div className="flex h-12 items-center justify-between border-b border-border px-3">
                <span className="text-sm font-semibold">{org.name}</span>
                <Button variant="ghost" size="icon" aria-label="Close navigation" onClick={() => setMobileOpen(false)}>
                  <X />
                </Button>
              </div>
              <Sidebar slug={org.slug} counts={counts} collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        ) : null}
        <main id="main" className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">
          {children}
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} slug={org.slug} permissions={permissions} />
    </div>
  );
}
