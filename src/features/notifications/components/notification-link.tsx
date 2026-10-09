"use client";

import { useRouter } from "next/navigation";
import { markNotificationReadAction } from "../actions";

/** Marks the notification as read, then navigates to its target. */
export function NotificationLink({
  orgSlug,
  id,
  href,
  unread,
  children,
}: {
  orgSlug: string;
  id: string;
  href: string;
  unread: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <a
      href={href}
      className="hover:bg-hover flex items-start gap-3 px-4 py-3"
      onClick={async (e) => {
        e.preventDefault();
        if (unread) await markNotificationReadAction(orgSlug, id);
        router.push(href);
      }}
    >
      {children}
      {unread ? <span className="sr-only">Unread</span> : null}
    </a>
  );
}
