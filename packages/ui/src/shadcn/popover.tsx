import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "../lib/cn";
import { usePortalContainer } from "../lib/portal";

const ShPopover = PopoverPrimitive.Root;
const ShPopoverTrigger = PopoverPrimitive.Trigger;
const ShPopoverAnchor = PopoverPrimitive.Anchor;

const ShPopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 6, ...props }, ref) => {
  const container = usePortalContainer();
  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-72 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lift outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
ShPopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { ShPopover, ShPopoverTrigger, ShPopoverAnchor, ShPopoverContent };
