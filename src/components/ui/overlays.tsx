"use client";

import * as React from "react";
import { Dialog as D, DropdownMenu as DM, Popover as P, Tooltip as T } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Dialog ─────────────────────────────────────────────────────────────────

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentProps<typeof D.Content> & { title: string; description?: React.ReactNode }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <D.Content
        className={cn(
          "border-border bg-surface text-foreground fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border",
          className,
        )}
        {...props}
      >
        <div className="border-border flex items-start justify-between gap-4 border-b px-5 py-3.5">
          <div className="min-w-0">
            <D.Title className="text-sm font-semibold">{title}</D.Title>
            {description ? (
              <D.Description className="text-muted-foreground mt-1 text-[13px]">
                {description}
              </D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close
            className="text-muted-foreground hover:bg-hover hover:text-foreground rounded-sm p-1"
            aria-label="Close"
          >
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

/** A side sheet built on the dialog primitive (quick create and edit). */
export function SheetContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentProps<typeof D.Content> & { title: string; description?: React.ReactNode }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/30" />
      <D.Content
        className={cn(
          "border-border bg-surface text-foreground fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l",
          className,
        )}
        {...props}
      >
        <div className="border-border flex items-start justify-between gap-4 border-b px-5 py-3.5">
          <div className="min-w-0">
            <D.Title className="text-sm font-semibold">{title}</D.Title>
            {description ? (
              <D.Description className="text-muted-foreground mt-1 text-[13px]">
                {description}
              </D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close
            className="text-muted-foreground hover:bg-hover hover:text-foreground rounded-sm p-1"
            aria-label="Close"
          >
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

// ─── Dropdown menu ──────────────────────────────────────────────────────────

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export const DropdownMenuGroup = DM.Group;

export function DropdownMenuContent({
  className,
  align = "end",
  ...props
}: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={4}
        className={cn(
          "border-border bg-surface text-foreground z-50 min-w-48 rounded-md border p-1 text-[13px] shadow-sm",
          className,
        )}
        {...props}
      />
    </DM.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof DM.Item>) {
  return (
    <DM.Item
      className={cn(
        "data-[highlighted]:bg-hover [&_svg]:text-muted-foreground flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 outline-none select-none data-[disabled]:opacity-50 [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return (
    <DM.Label className={cn("text-muted-foreground px-2 py-1.5 text-xs", className)} {...props} />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn("bg-border my-1 h-px", className)} {...props} />;
}

// ─── Popover ────────────────────────────────────────────────────────────────

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;

export function PopoverContent({
  className,
  align = "start",
  ...props
}: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={6}
        className={cn(
          "border-border bg-surface text-foreground z-50 w-72 rounded-md border p-3 text-[13px] shadow-sm",
          className,
        )}
        {...props}
      />
    </P.Portal>
  );
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <T.Provider delayDuration={250}>{children}</T.Provider>;
}

/** Wraps a trigger with a tooltip. Disabled buttons are wrapped in a span so the tip still shows. */
export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: "top" | "bottom" | "left" | "right";
}) {
  if (!content) return children;
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={4}
          className="border-border bg-foreground text-background z-50 max-w-72 rounded-sm border px-2 py-1 text-xs"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
