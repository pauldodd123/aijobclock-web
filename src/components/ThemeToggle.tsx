"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <button className="p-1 sm:p-1.5 text-muted-foreground rounded-md" aria-label="Toggle theme">
        <Sun className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
      </button>
    );
  }

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="p-1 sm:p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <Sun className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
      ) : (
        <Moon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
      )}
    </button>
  );
}
