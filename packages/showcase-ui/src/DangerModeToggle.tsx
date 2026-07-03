/**
 * The "simulate malicious X" pill switch. Copy-pasted near-identically
 * across all six showcase demo dApps before this extraction. same markup,
 * same interaction, only the label and accent color varied per site.
 */

export interface DangerModeToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /** Site accent for the active state. Defaults to a shared danger red. */
  activeColor?: string;
}

export function DangerModeToggle({
  checked,
  onChange,
  label,
  activeColor = "#ef4444",
}: DangerModeToggleProps) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-bone border border-ink-900/10">
      <span className="text-xs text-ink-500">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className="relative w-10 h-5 rounded-full transition-colors"
        style={{ background: checked ? activeColor : "rgba(20,20,20,0.12)" }}
      >
        <div
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-card transition-transform"
          style={{ transform: checked ? "translateX(21px)" : "translateX(2px)" }}
        />
      </button>
      {checked && (
        <span className="text-xs font-medium" style={{ color: activeColor }}>
          ⚠ Danger mode
        </span>
      )}
    </div>
  );
}
