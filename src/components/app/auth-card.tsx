export function AuthCard({ title, description, children, footer }: { title: string; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div>
      <div className="rounded-md border border-border bg-surface p-6">
        <h1 className="text-lg font-semibold">{title}</h1>
        {description ? <p className="mt-1 text-[13px] text-muted-foreground">{description}</p> : null}
        <div className="mt-5">{children}</div>
      </div>
      {footer ? <div className="mt-4 text-center text-[13px] text-muted-foreground">{footer}</div> : null}
    </div>
  );
}
