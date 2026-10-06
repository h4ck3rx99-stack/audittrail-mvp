"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/overlays";

export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
      <TooltipProvider>
        {children}
        <Toaster position="bottom-right" toastOptions={{ className: "!rounded-md !border-border !text-[13px]" }} />
      </TooltipProvider>
    </ThemeProvider>
  );
}
