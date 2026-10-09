export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div>
      <div className="border-border bg-surface rounded-md border p-6">
        <h1 className="text-lg font-semibold">{title}</h1>
        {description ? (
          <p className="text-muted-foreground mt-1 text-[13px]">{description}</p>
        ) : null}
        <div className="mt-5">{children}</div>
      </div>
      {footer ? (
        <div className="text-muted-foreground mt-4 text-center text-[13px]">{footer}</div>
      ) : null}
    </div>
  );
}
