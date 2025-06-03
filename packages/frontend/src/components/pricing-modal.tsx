"use client";

import { useId, useState } from "react";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { redirectToCheckout, STRIPE_PRICES } from "@/lib/stripe";
import { useAppSettings } from "@/hooks/use-app-settings";

interface PricingModalProps {
  children: React.ReactNode;
}

export function PricingModal({ children }: PricingModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("monthly");
  const [isOpen, setIsOpen] = useState(false);
  const id = useId();
  const {
    settings: { plans },
  } = useAppSettings();
  const { premium, free } = plans;

  const handlePlanSelect = async () => {
    setIsLoading(true);
    try {
      const priceId = selectedPlan === "monthly" ? STRIPE_PRICES.premium_monthly : STRIPE_PRICES.premium_yearly;
      await redirectToCheckout(priceId);
    } catch (error) {
      console.error("Failed to start checkout:", error);
      setIsLoading(false);
    }
  };

  const getCostSavings = (yearlyPrice: number, monthlyPrice: number) => {
    if (!yearlyPrice || !monthlyPrice) {
      return 0;
    }

    const savedPerYear = yearlyPrice - monthlyPrice * 12;
    const percentageSaved = (savedPerYear / yearlyPrice) * 100;
    return percentageSaved.toFixed(0);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children as any}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose Your Plan</DialogTitle>
          <p className="text-sm text-gray-600">Upgrade to Premium to make the most of our converter</p>
        </DialogHeader>

        <RadioGroup value={selectedPlan} onValueChange={setSelectedPlan} className="gap-3 mb-4">
          {/* Monthly Plan */}
          <div className="border-input has-[[data-state=checked]]:border-primary/50 relative flex w-full items-start gap-3 rounded-md border p-4 shadow-sm outline-none">
            <RadioGroupItem
              value="monthly"
              id={`${id}-monthly`}
              aria-describedby={`${id}-monthly-description`}
              className="order-1 after:absolute after:inset-0"
            />
            <div className="flex grow items-start gap-3">
              <div className="shrink-0 flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full">
                <span className="text-blue-600 font-bold text-sm">M</span>
              </div>
              <div className="grid grow gap-1">
                <Label htmlFor={`${id}-monthly`} className="font-medium">
                  Monthly Plan
                  <span className="text-muted-foreground text-xs leading-[inherit] font-normal ml-1">
                    (${premium.price?.monthly}/month)
                  </span>
                </Label>
                <p id={`${id}-monthly-description`} className="text-muted-foreground text-xs">
                  For trying out Premium
                </p>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold">${premium.price?.monthly}</div>
                <div className="text-xs text-gray-500">per month</div>
              </div>
            </div>
          </div>

          {/* Yearly Plan */}
          <div className="border-input has-[[data-state=checked]]:border-primary/50 relative flex w-full items-start gap-3 rounded-md border p-4 shadow-sm outline-none">
            <RadioGroupItem
              value="yearly"
              id={`${id}-yearly`}
              aria-describedby={`${id}-yearly-description`}
              className="order-1 after:absolute after:inset-0"
            />
            <div className="flex grow items-start gap-3">
              <div className="shrink-0 flex items-center justify-center w-8 h-8 bg-green-100 rounded-full">
                <span className="text-green-600 font-bold text-sm">Y</span>
              </div>
              <div className="grid grow gap-1">
                <Label htmlFor={`${id}-yearly`} className="font-medium">
                  Yearly Plan
                  <span className="text-green-600 text-xs leading-[inherit] font-medium ml-1">
                    (Save {getCostSavings(premium.price?.yearly ?? 0, premium.price?.monthly ?? 0)}
                    %)
                  </span>
                </Label>
                <p id={`${id}-yearly-description`} className="text-muted-foreground text-xs">
                  Best value for regular users
                </p>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold">${premium.price?.yearly}</div>
                <div className="text-xs text-gray-500">per year</div>
              </div>
            </div>
          </div>
        </RadioGroup>

        <Button disabled className="w-full mb-4" onClick={handlePlanSelect}>
          Disabled for now
          {/* {isLoading ? "Processing..." : `Choose ${selectedPlan === "monthly" ? "Monthly" : "Yearly"} Plan`} */}
        </Button>

        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-medium">Premium includes:</p>
          <ul className="text-xs text-gray-600 space-y-1">
            <li className="flex items-center">
              <CheckIcon className="h-3 w-3 text-green-500 mr-2" />
              More batch conversions (up to {premium.maxFiles} files)
            </li>
            <li className="flex items-center">
              <CheckIcon className="h-3 w-3 text-green-500 mr-2" />
              Converts {premium.quotas.conversionsPerMonth} files per month
            </li>
            <li className="flex items-center">
              <CheckIcon className="h-3 w-3 text-green-500 mr-2" />
              Supports larger file sizes (up to {premium.maxFileSizeMB / 1024}GB)
            </li>
            <li className="flex items-center">
              <CheckIcon className="h-3 w-3 text-green-500 mr-2" />
              And more...
            </li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
