"use client";

import { ErrorView } from "@/components/app/error-view";

export default function OrgError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorView reset={reset} digest={error.digest} />;
}
