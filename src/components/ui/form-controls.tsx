import * as React from "react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-sm border border-input bg-background px-2.5 text-[13px] text-foreground placeholder:text-faint-foreground transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea className={cn(fieldBase, "min-h-20 py-1.5 leading-relaxed", className)} {...props} />
  );
}

export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select className={cn(fieldBase, "h-8 pr-7", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-foreground text-[13px] font-medium", className)} {...props} />;
}

export function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      className={cn("border-input size-4 rounded-sm border accent-[var(--accent)]", className)}
      {...props}
    />
  );
}

/** Label + control + hint + field errors, wired up with aria attributes. */
export function Field({
  label,
  htmlFor,
  hint,
  errors,
  children,
  className,
  optional,
}: {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  errors?: string[];
  children: React.ReactNode;
  className?: string;
  optional?: boolean;
}) {
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {optional ? (
          <span className="text-faint-foreground ml-1 font-normal">(optional)</span>
        ) : null}
      </Label>
      {React.isValidElement<Record<string, unknown>>(children)
        ? React.cloneElement(children, {
            id: htmlFor,
            "aria-invalid": errors?.length ? true : undefined,
            "aria-describedby":
              [errors?.length ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
              undefined,
          })
        : children}
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
      {errors?.length ? (
        <p id={errorId} className="text-danger text-xs" role="alert">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="border-danger/40 text-danger rounded-sm border px-3 py-2 text-[13px]"
    >
      {message}
    </p>
  );
}
