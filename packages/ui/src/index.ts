/**
 * @stellar-thorn/ui
 * Shared design system: tokens, primitives, brand glyph.
 *
 * Tokens: import "@stellar-thorn/ui/tokens.css" once at app entry.
 */

export { Mark } from "./brand/Mark";

export { cn } from "./lib/cn";

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
