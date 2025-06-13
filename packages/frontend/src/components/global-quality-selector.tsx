"use client";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useId } from "react";

interface GlobalQualitySelectorProps {
  globalQuality: string;
  availableQualities: Array<{ value: string; label: string }>;
  allQualities: Array<{ value: string; label: string }>;
  onGlobalQualityChange: (quality: string) => void;
}

export function GlobalQualitySelector({
  globalQuality,
  availableQualities,
  allQualities,
  onGlobalQualityChange,
}: GlobalQualitySelectorProps) {
  const id = useId();
  const availableValues = new Set(availableQualities.map((q) => q.value));

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 text-sm">
      <span className="text-muted-foreground whitespace-nowrap">Quality</span>
      <RadioGroup
        value={globalQuality}
        onValueChange={onGlobalQualityChange}
        className="flex gap-0 -space-x-px rounded-md shadow-xs w-full sm:w-auto"
      >
        {allQualities.map((quality) => {
          const isDisabled = !availableValues.has(quality.value);

          const radioButton = (
            <label
              key={quality.value}
              className={`border-input has-data-[state=checked]:border-primary/50 has-focus-visible:border-ring has-focus-visible:ring-ring/50 relative flex h-7 min-w-12 flex-1 cursor-pointer items-center justify-center border px-2 text-center text-xs font-medium transition-[color,box-shadow] outline-none first:rounded-s-md last:rounded-e-md has-focus-visible:ring-[3px] has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50 has-data-[state=checked]:z-10 has-data-[state=checked]:bg-primary/5 ${
                isDisabled ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <RadioGroupItem
                id={`${id}-${quality.value}`}
                value={quality.value}
                disabled={isDisabled}
                className="sr-only after:absolute after:inset-0"
              />
              {quality.label}
            </label>
          );

          if (isDisabled) {
            return (
              <Tooltip key={quality.value}>
                <TooltipTrigger asChild>{radioButton}</TooltipTrigger>
                <TooltipContent className="bg-black text-white" arrowClassName="fill-black">
                  <p>Only available in premium</p>
                </TooltipContent>
              </Tooltip>
            );
          }

          return radioButton;
        })}
      </RadioGroup>
    </div>
  );
}
