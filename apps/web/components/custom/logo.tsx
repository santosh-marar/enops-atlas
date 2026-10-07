"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function Logo() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Image
        alt="Enops.dev Logo"
        className="rounded-full"
        height={32}
        src={resolvedTheme === "dark" ? "/logo-dark.png" : "/logo-light.png"}
        width={32}
      />
      <span className="font-semibold">Enops</span>
    </div>
  );
}
