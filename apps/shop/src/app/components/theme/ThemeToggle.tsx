import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

// The exact classes ui/button's ghost icon Button renders. That component merges classes with tailwind-merge (27 KB),
// which then loaded with every shop page because the header shows this toggle; a fixed string needs no merging.
const TOGGLE_CLASS = "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 rounded-md";

export function ThemeToggle({ label = "Toggle theme" }: { label?: string } = {}) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      data-slot="button"
      className={TOGGLE_CLASS}
      onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">{label}</span>
    </button>
  );
}
