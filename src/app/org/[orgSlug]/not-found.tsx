import Link from "next/link";

export default function OrgNotFound() {
  return (
    <div className="border-border mx-auto mt-16 max-w-md rounded-md border p-6 text-center">
      <h1 className="text-sm font-semibold">Not found</h1>
      <p className="text-muted-foreground mt-1 text-[13px]">
        This item does not exist, was removed, or you do not have access to it.
      </p>
      <Link href="/org" className="text-accent mt-4 inline-block text-[13px] hover:underline">
        Back to your organizations
      </Link>
    </div>
  );
}
