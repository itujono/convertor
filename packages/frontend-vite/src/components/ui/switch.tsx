import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

interface SwitchProps {
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  className?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  value?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

function Switch({
  className,
  leadingIcon,
  trailingIcon,
  checked,
  onCheckedChange,
  ...props
}: SwitchProps) {
  // If no icons are provided, render the simple switch
  if (!leadingIcon && !trailingIcon) {
    return (
      <SwitchPrimitive.Root
        data-slot="switch"
        className={cn(
          "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:ring-ring/50 inline-flex h-6 w-10 shrink-0 items-center rounded-full border-2 border-transparent transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        checked={checked}
        onCheckedChange={onCheckedChange}
        {...props}
      >
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className={cn(
            "bg-background pointer-events-none block size-5 rounded-full shadow-xs ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0 data-[state=checked]:rtl:-translate-x-4"
          )}
        />
      </SwitchPrimitive.Root>
    );
  }

  // If icons are provided, render the switch with icons
  return (
    <div
      className={cn("group inline-flex items-center gap-2", className)}
      data-state={checked ? "checked" : "unchecked"}
    >
      {leadingIcon && (
        <span
          className="group-data-[state=checked]:text-muted-foreground/70 flex-1 cursor-pointer text-right text-sm font-medium transition-colors"
          onClick={() => onCheckedChange?.(false)}
        >
          {leadingIcon}
        </span>
      )}
      <SwitchPrimitive.Root
        data-slot="switch"
        className={cn(
          "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:ring-ring/50 inline-flex h-6 w-10 shrink-0 items-center rounded-full border-2 border-transparent transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
        )}
        checked={checked}
        onCheckedChange={onCheckedChange}
        {...props}
      >
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className={cn(
            "bg-background pointer-events-none block size-5 rounded-full shadow-xs ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0 data-[state=checked]:rtl:-translate-x-4"
          )}
        />
      </SwitchPrimitive.Root>
      {trailingIcon && (
        <span
          className="group-data-[state=unchecked]:text-muted-foreground/70 flex-1 cursor-pointer text-left text-sm font-medium transition-colors"
          onClick={() => onCheckedChange?.(true)}
        >
          {trailingIcon}
        </span>
      )}
    </div>
  );
}

export { Switch };
