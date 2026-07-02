import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import { cn } from "../lib/cn";
import {
  ShDialog,
  ShDialogContent,
  ShDialogHeader,
  ShDialogTitle,
} from "./dialog";

const ShCommand = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "flex h-full w-full flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground",
      className,
    )}
    {...props}
  />
));
ShCommand.displayName = CommandPrimitive.displayName;

function ShCommandDialog({
  children,
  ...props
}: React.ComponentProps<typeof ShDialog>) {
  return (
    <ShDialog {...props}>
      <ShDialogContent showClose={false} className="overflow-hidden p-0">
        <ShDialogHeader className="sr-only">
          <ShDialogTitle>Command menu</ShDialogTitle>
        </ShDialogHeader>
        <ShCommand className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input-wrapper]_svg]:size-4 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5">
          {children}
        </ShCommand>
      </ShDialogContent>
    </ShDialog>
  );
}

const ShCommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center gap-2 border-b border-border px-3" cmdk-input-wrapper="">
    <Search className="size-4 shrink-0 text-muted-foreground" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        "flex h-11 w-full bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  </div>
));
ShCommandInput.displayName = CommandPrimitive.Input.displayName;

const ShCommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn("max-h-72 overflow-y-auto overflow-x-hidden p-1", className)}
    {...props}
  />
));
ShCommandList.displayName = CommandPrimitive.List.displayName;

const ShCommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="py-6 text-center text-sm text-muted-foreground"
    {...props}
  />
));
ShCommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const ShCommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group ref={ref} className={cn("overflow-hidden p-1 text-foreground", className)} {...props} />
));
ShCommandGroup.displayName = CommandPrimitive.Group.displayName;

const ShCommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none",
      "data-[selected=true]:bg-secondary data-[selected=true]:text-foreground",
      "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
      className,
    )}
    {...props}
  />
));
ShCommandItem.displayName = CommandPrimitive.Item.displayName;

const ShCommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator ref={ref} className={cn("-mx-1 h-px bg-border", className)} {...props} />
));
ShCommandSeparator.displayName = CommandPrimitive.Separator.displayName;

export {
  ShCommand,
  ShCommandDialog,
  ShCommandInput,
  ShCommandList,
  ShCommandEmpty,
  ShCommandGroup,
  ShCommandItem,
  ShCommandSeparator,
};
