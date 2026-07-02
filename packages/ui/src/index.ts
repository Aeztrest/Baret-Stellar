/**
 * @stellar-thorn/ui
 * Shared design system: tokens, primitives, brand glyph.
 *
 * Tokens: import "@stellar-thorn/ui/tokens.css" once at app entry.
 */

export { Mark } from "./brand/Mark";

export { cn } from "./lib/cn";

/* ── Theme + portal infrastructure ── */
export {
  ThemeProvider,
  useTheme,
  applyStoredTheme,
} from "./lib/theme";
export type { ThemeMode, ResolvedTheme } from "./lib/theme";
export { PortalContainerProvider, usePortalContainer } from "./lib/portal";
export { ThemeToggle } from "./theme/ThemeToggle";

/* ── Motion primitives ── */
export { Reveal, RevealGroup, RevealItem } from "./motion/Reveal";
export type { RevealProps, RevealGroupProps } from "./motion/Reveal";
export { SpotlightCard } from "./motion/SpotlightCard";
export type { SpotlightCardProps } from "./motion/SpotlightCard";

/* ── Marketing layout primitives ── */
export { Container } from "./layout/Container";
export { Eyebrow } from "./layout/Eyebrow";
export { PageSection, SectionHeading } from "./layout/PageSection";

/* ── shadcn/ui layer (Sh* prefix) ── */
export * from "./shadcn";

export { toneStyle } from "./utils/tone";
export type { Tone, ToneStyle } from "./utils/tone";
export { shortAddr } from "./utils/address";
export type { ShortAddrOptions } from "./utils/address";
export { APP_VERSION, versionLabel } from "./utils/version";

export { usePolling } from "./hooks/usePolling";
export type { UsePollingOptions } from "./hooks/usePolling";

export { Button } from "./primitives/Button/Button";
export type { ButtonProps } from "./primitives/Button/Button";
export { Badge } from "./primitives/Badge/Badge";
export type { BadgeProps } from "./primitives/Badge/Badge";
export { Card } from "./primitives/Card/Card";
export type { CardProps } from "./primitives/Card/Card";
export { Section } from "./primitives/Section/Section";
export type { SectionProps } from "./primitives/Section/Section";
export { ListItem } from "./primitives/ListItem/ListItem";
export type { ListItemProps } from "./primitives/ListItem/ListItem";
export { EmptyState } from "./primitives/EmptyState/EmptyState";
export type { EmptyStateProps } from "./primitives/EmptyState/EmptyState";
export { Input } from "./primitives/Input/Input";
export type { InputProps } from "./primitives/Input/Input";
export { Dialog } from "./primitives/Dialog/Dialog";
export type { DialogProps } from "./primitives/Dialog/Dialog";
export { Meter } from "./primitives/Meter/Meter";
export type { MeterProps } from "./primitives/Meter/Meter";
export { StatTile } from "./primitives/StatTile/StatTile";
export type { StatTileProps } from "./primitives/StatTile/StatTile";
export { Verdict } from "./primitives/Verdict/Verdict";
export type { VerdictProps, VerdictTone } from "./primitives/Verdict/Verdict";
export { CompareSplit } from "./primitives/CompareSplit/CompareSplit";
export type { CompareSplitProps } from "./primitives/CompareSplit/CompareSplit";
