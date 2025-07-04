"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Zap } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PricingModal({ isOpen, onClose }: PricingModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const { user } = useAuth();

  const handleCheckout = async (plan: "monthly" | "yearly") => {
    if (!user) {
      toast.error("Please sign in to upgrade");
      return;
    }

    setIsProcessing(true);

    try {
      // Call our backend to create a checkout session using the API client
      const { checkoutUrl } = await apiClient.createCheckoutSession(plan);

      if (checkoutUrl) {
        // Redirect to LemonSqueezy checkout
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

        <div className="grid md:grid-cols-2 gap-6 mt-6">
          {/* Monthly Plan */}
          <div className="border rounded-lg p-6 relative">
            <div className="text-center">
              <h3 className="text-xl font-semibold">Monthly</h3>
              <div className="mt-4 flex items-baseline justify-center">
                <span className="text-4xl font-bold">$9</span>
                <span className="text-gray-500 ml-1">/month</span>
              </div>
            </div>

            <ul className="mt-6 space-y-4">
              <li className="flex items-center">
                <Check className="h-5 w-5 text-green-500 mr-3" />
                <span className="text-sm">Unlimited conversions</span>
              </li>
              <li className="flex items-center">
                <Check className="h-5 w-5 text-green-500 mr-3" />
                <span className="text-sm">Priority processing</span>
              </li>
              <li className="flex items-center">
                <Check className="h-5 w-5 text-green-500 mr-3" />
                <span className="text-sm">Advanced formats</span>
              </li>
              <li className="flex items-center">
                <Check className="h-5 w-5 text-green-500 mr-3" />
                <span className="text-sm">24/7 support</span>
              </li>
            </ul>

            <Button className="w-full mt-6" onClick={() => handleCheckout("monthly")} disabled={!user || isProcessing}>
              {isProcessing ? "Processing..." : "Upgrade to Monthly"}
            </Button>
          </div>

          {/* Yearly Plan */}
          <div className="border rounded-lg p-6 relative border-primary">
            <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary">
              <Zap className="h-3 w-3 mr-1" />
              Best Value
            </Badge>

            <div className="text-center">
              <h3 className="text-xl font-semibold">Yearly</h3>
              <div className="mt-4 flex items-baseline justify-center">
                <span className="text-4xl font-bold">$90</span>
                <span className="text-gray-500 ml-1">/year</span>
              </div>
              <p className="text-sm text-green-600 mt-1">Save $18/year</p>
            </div>

            <ul className="mt-6 space-y-4">
              <li className="flex items-center">
                <Check className="h-5 w-5 text-green-500 mr-3" />
                <span className="text-sm">Unlimited conversions</span>
              </li>
              <li className="flex items-center">
                <Check className="h-5 w-5 text-green-500 mr-3" />
                <span className="text-sm">Priority processing</span>
              </li>
              <li className="flex items-center">
                <Check className="h-5 w-5 text-green-500 mr-3" />
                <span className="text-sm">Advanced formats</span>
              </li>
              <li className="flex items-center">
                <Check className="h-5 w-5 text-green-500 mr-3" />
                <span className="text-sm">24/7 support</span>
              </li>
            </ul>

            <Button className="w-full mt-6" onClick={() => handleCheckout("yearly")} disabled={!user || isProcessing}>
              {isProcessing ? "Processing..." : "Upgrade to Yearly"}
            </Button>
          </div>
        </div>

        {!user && <p className="text-center text-sm text-gray-500 mt-4">Please sign in to purchase a subscription</p>}
      </DialogContent>
    </Dialog>
  );
}
