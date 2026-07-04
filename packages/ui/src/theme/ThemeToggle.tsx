import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "../lib/cn";
import { useTheme, type ThemeMode } from "../lib/theme";

const ICON: Record<ThemeMode, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};
const LABEL: Record<ThemeMode, string> = {
  system: "System theme",
  light: "Light theme",
  dark: "Dark theme",
};

/**
 * The house theme control. a single icon button that cycles
 * system → light → dark. No popup. Reflects the user's chosen `mode`
 * (not the resolved theme) so the icon communicates intent.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { mode, cycle } = useTheme();
  const Icon = ICON[mode];
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${LABEL[mode]}. click to change`}
      title={LABEL[mode]}
      className={cn(
        "inline-grid size-9 place-items-center rounded-md border border-border text-muted-foreground",
        "transition-colors hover:border-foreground/30 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <Icon size={16} aria-hidden />
    </button>
  );
}
