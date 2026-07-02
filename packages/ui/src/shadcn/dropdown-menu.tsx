import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Circle } from "lucide-react";
import { cn } from "../lib/cn";
import { usePortalContainer } from "../lib/portal";

const ShDropdownMenu = DropdownMenuPrimitive.Root;
const ShDropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const ShDropdownMenuGroup = DropdownMenuPrimitive.Group;
const ShDropdownMenuSub = DropdownMenuPrimitive.Sub;
const ShDropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const ShDropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => {
  const container = usePortalContainer();
  return (
    <DropdownMenuPrimitive.Portal container={container}>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[10rem] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lift",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
});
ShDropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const itemBase =
  "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors focus:bg-secondary focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

const ShDropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { inset?: boolean; destructive?: boolean }
>(({ className, inset, destructive, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      itemBase,
      inset && "pl-8",
      destructive && "text-[var(--bad)] focus:bg-[var(--bad-dim)] focus:text-[var(--bad)]",
      className,
    )}
    {...props}
  />
));
ShDropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const ShDropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(itemBase, "pl-8", className)}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="size-4 text-primary" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
ShDropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName;

const ShDropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem ref={ref} className={cn(itemBase, "pl-8", className)} {...props}>
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle className="size-2 fill-primary text-primary" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
ShDropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

const ShDropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      "px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
      inset && "pl-8",
      className,
    )}
    {...props}
  />
));
ShDropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const ShDropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-border", className)}
    {...props}
  />
));
ShDropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

const ShDropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger ref={ref} className={cn(itemBase, className)} {...props}>
    {children}
    <ChevronRight className="ml-auto size-4" />
  </DropdownMenuPrimitive.SubTrigger>
));
ShDropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName;

const ShDropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => {
  const container = usePortalContainer();
  return (
    <DropdownMenuPrimitive.Portal container={container}>
      <DropdownMenuPrimitive.SubContent
        ref={ref}
        className={cn(
          "z-50 min-w-[8rem] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lift",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
});
ShDropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName;

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
};
