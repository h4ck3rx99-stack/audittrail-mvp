"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/lib/action-result";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlays";
import { Tooltip } from "@/components/ui/overlays";

export type FormAction<T> = (
  prev: ActionResult<T> | null,
  formData: FormData,
) => Promise<ActionResult<T>>;

/**
 * useActionState wrapper: field errors for the form, a toast for the outcome, and an optional
 * success callback (e.g. closing a sheet).
 */
export function useActionForm<T>(
  action: FormAction<T>,
  options: { success?: string | ((data: T) => string | null); onSuccess?: (data: T) => void } = {},
) {
  const [state, formAction, pending] = React.useActionState(action, null);
  const handled = React.useRef<ActionResult<T> | null>(null);
  const { success, onSuccess } = options;

  React.useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      const message = typeof success === "function" ? success(state.data) : success;
      if (message) toast.success(message);
      onSuccess?.(state.data);
    } else if (!state.error.fieldErrors || state.error.code !== "VALIDATION") {
      toast.error(state.error.message);
    }
  }, [state, success, onSuccess]);

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;
  const formError =
    state && !state.ok && state.error.code === "VALIDATION" && state.error.fieldErrors
      ? state.error.message
      : null;
  return { state, formAction, pending, fieldErrors, formError };
}

export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      disabled={pending || props.disabled}
      aria-disabled={pending}
      {...props}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

type ConfirmOptions = {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
};

/**
 * A button that runs a bound Server Action, with pending state, toast feedback and an optional
 * confirmation dialog for destructive or irreversible actions. When `disabledReason` is set, the
 * button is disabled and the reason is shown as a tooltip.
 */
export function ActionButton<T>({
  action,
  children,
  confirm,
  success,
  disabledReason,
  onDone,
  ...buttonProps
}: Omit<ButtonProps, "onClick" | "action"> & {
  action: () => Promise<ActionResult<T>>;
  confirm?: ConfirmOptions;
  success?: string;
  disabledReason?: string | null;
  onDone?: (data: T) => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);

  const run = () =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        if (success) toast.success(success);
        setOpen(false);
        onDone?.(result.data);
      } else {
        toast.error(result.error.message);
      }
    });

  if (disabledReason) {
    return (
      <Tooltip content={disabledReason}>
        <span tabIndex={0} className="inline-flex">
          <Button {...buttonProps} disabled aria-disabled>
            {children}
          </Button>
        </span>
      </Tooltip>
    );
  }

  if (!confirm) {
    return (
      <Button {...buttonProps} onClick={run} disabled={pending || buttonProps.disabled}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {children}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button {...buttonProps}>{children}</Button>
      </DialogTrigger>
      <DialogContent title={confirm.title} description={null}>
        <div
          className={
            confirm.destructive
              ? "border-danger/40 bg-danger-subtle rounded-sm border p-3 text-[13px]"
              : "text-[13px]"
          }
        >
          {confirm.description}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={confirm.destructive ? "danger" : "primary"}
            onClick={run}
            disabled={pending}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {confirm.confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Copies text to the clipboard with feedback (invite links, hashes). */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast.success("Copied to clipboard");
        } catch {
          toast.error("Could not copy. Select the text and copy it manually.");
        }
      }}
    >
      {label}
    </Button>
  );
}
