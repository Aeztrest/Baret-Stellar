/**
 * Baret's shadcn/ui layer. Radix primitives + Tailwind, copy-in source we
 * own and edit freely. Exported under the `Sh*` prefix so they coexist with
 * Baret's higher-level product primitives (Button, Card, …) during migration.
 * Neutral hover surfaces use `secondary`/`muted`, never the brand accent.
 */
export { ShButton, buttonVariants } from "./button";
export type { ShButtonProps } from "./button";
export {
  ShCard,
  ShCardHeader,
  ShCardTitle,
  ShCardDescription,
  ShCardContent,
  ShCardFooter,
} from "./card";
export { ShBadge, badgeVariants } from "./badge";
export type { ShBadgeProps } from "./badge";
export { ShInput } from "./input";
export { ShLabel } from "./label";
export { ShSeparator } from "./separator";
export { ShSwitch } from "./switch";
export { ShTabs, ShTabsList, ShTabsTrigger, ShTabsContent } from "./tabs";
export {
  ShAccordion,
  ShAccordionItem,
  ShAccordionTrigger,
  ShAccordionContent,
} from "./accordion";
export {
  ShTable,
  ShTableHeader,
  ShTableBody,
  ShTableRow,
  ShTableHead,
  ShTableCell,
} from "./table";
export {
  ShDialog,
  ShDialogTrigger,
  ShDialogClose,
  ShDialogContent,
  ShDialogHeader,
  ShDialogFooter,
  ShDialogTitle,
  ShDialogDescription,
} from "./dialog";
export {
  ShSheet,
  ShSheetTrigger,
  ShSheetClose,
  ShSheetContent,
  ShSheetHeader,
  ShSheetFooter,
  ShSheetTitle,
  ShSheetDescription,
} from "./sheet";
export { ShTooltip, ShTooltipTrigger, ShTooltipContent, ShTooltipProvider } from "./tooltip";
export { ShPopover, ShPopoverTrigger, ShPopoverAnchor, ShPopoverContent } from "./popover";
export {
  ShDropdownMenu,
  ShDropdownMenuTrigger,
  ShDropdownMenuContent,
  ShDropdownMenuItem,
  ShDropdownMenuCheckboxItem,
  ShDropdownMenuRadioItem,
  ShDropdownMenuLabel,
  ShDropdownMenuSeparator,
  ShDropdownMenuGroup,
  ShDropdownMenuSub,
  ShDropdownMenuSubTrigger,
  ShDropdownMenuSubContent,
  ShDropdownMenuRadioGroup,
} from "./dropdown-menu";
export { ShScrollArea, ScrollBar } from "./scroll-area";
export { ShToaster, toast } from "./sonner";
export {
  ShCommand,
  ShCommandDialog,
  ShCommandInput,
  ShCommandList,
  ShCommandEmpty,
  ShCommandGroup,
  ShCommandItem,
  ShCommandSeparator,
} from "./command";
