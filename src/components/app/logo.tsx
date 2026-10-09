export function Logo({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill="var(--accent)" />
      <path
        d="M9 21.5 14 10h4l5 11.5h-3.6l-1-2.5h-4.8l-1 2.5H9Zm5.6-5.3h2.8L16 12.6l-1.4 3.6Z"
        fill="var(--accent-foreground)"
      />
    </svg>
  );
}
