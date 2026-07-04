import { Toaster as SonnerToaster, toast } from "sonner";
import { useTheme } from "../lib/theme";

type ShToasterProps = React.ComponentProps<typeof SonnerToaster>;

/**
 * Baret toaster. sonner styled with our tokens and driven by the shared
 * theme controller (so a manual dark toggle also flips toasts, not just OS
 * preference). Mount once near the app root, inside <ThemeProvider>.
 */
function ShToaster(props: ShToasterProps) {
  const { resolved } = useTheme();
  return (
    <SonnerToaster
      theme={resolved}
      className="toaster group"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:shadow-lift group-[.toaster]:rounded-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-secondary group-[.toast]:text-secondary-foreground",
        },
      }}
      {...props}
    />
  );
}

export { ShToaster, toast };
