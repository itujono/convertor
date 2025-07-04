"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Check, Zap } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { AppSettings } from "@/lib/app-settings";

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PricingModal({ isOpen, onClose }: PricingModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const { user } = useAuth();
  const premium = AppSettings.plans.premium;

  const handleCheckout = async (plan: "monthly" | "yearly") => {
    if (!user) {
      toast.error("Please sign in to upgrade");
      return;
    }

    setIsProcessing(true);

    try {
      const { checkoutUrl } = await apiClient.createCheckoutSession(plan);

      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        throw new Error("No checkout URL received");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Failed to create checkout session. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Choose Your Plan</DialogTitle>
          <p className="text-sm text-gray-600">Upgrade to Premium to make the most of our converter</p>
        </DialogHeader>

        <div className="space-y-6 mt-6">
          {/* Monthly Plan */}
          <div className="border rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h3 className="font-semibold">Monthly</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold">${premium.price?.monthly ?? 0}</span>
                  <span className="text-gray-500 text-sm relative md:bottom-0.5">/month</span>
                </div>
              </div>
            </div>
            <Button onClick={() => handleCheckout("monthly")} disabled={!user || isProcessing} className="w-36">
              {isProcessing ? "Processing..." : "Get Monthly"} <ArrowRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Yearly Plan */}
          <div className="border border-primary rounded-lg p-4 flex items-center justify-between relative">
            {premium.price?.yearly && (
              <Badge className="absolute -top-3 left-4 bg-primary">
                <Zap className="h-3 w-3 mr-1" />
                Best Value
              </Badge>
            )}
            <div className="flex items-center gap-4">
              <div>
                <h3 className="font-semibold">Yearly</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold">${premium.price?.yearly ?? 0}</span>
                  <span className="text-gray-500 text-sm relative md:bottom-0.5">/year</span>
                  {/* <p className="text-sm text-green-600 ml-2 relative md:bottom-0.5">
                    Save{" "}
                    {Math.round(
                      ((premium.price?.monthly ?? 0 * 12 - premium.price?.yearly ?? 0) /
                        (premium.price?.monthly ?? 0 * 12)) *
                        100,
                    )}
                    %
                  </p> */}
                </div>
              </div>
            </div>
            <Button onClick={() => handleCheckout("yearly")} disabled={!user || isProcessing} className="w-36">
              {isProcessing ? "Processing..." : "Get Yearly"} <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Shared Benefits */}
        <div className="mt-4 space-y-2">
          <h4 className="font-semibold text-gray-900">What you get:</h4>
          <ul className="space-y-3 text-gray-600">
            <li className="flex items-center">
              <Check className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
              <span className="text-sm">More batch conversions (up to {premium.maxFiles} files)</span>
            </li>
            <li className="flex items-center">
              <Check className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
              <span className="text-sm">Converts {premium.quotas.conversionsPerMonth} files per month</span>
            </li>
            <li className="flex items-center">
              <Check className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
              <span className="text-sm">Supports larger file sizes (up to {premium.maxFileSizeMB / 1024}GB)</span>
            </li>
            <li className="flex items-center">
              <Check className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
              <span className="text-sm">And more...</span>
            </li>
          </ul>
        </div>

        {!user && <p className="text-center text-sm text-gray-500 mt-4">Please sign in to purchase a subscription</p>}
      </DialogContent>
    </Dialog>
  );
}
