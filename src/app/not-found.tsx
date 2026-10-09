import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto mt-24 max-w-md px-4 text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="text-muted-foreground mt-1 text-[13px]">
        The page does not exist or you do not have access to it.
      </p>
      <Link href="/" className="text-accent mt-4 inline-block text-[13px] hover:underline">
        Go to the home page
      </Link>
    </main>
  );
}
