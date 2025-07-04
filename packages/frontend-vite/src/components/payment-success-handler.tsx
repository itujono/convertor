import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { queryKeys } from "@/lib/api-hooks";

export function PaymentSuccessHandler() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useAuth();

  useEffect(() => {
    // Get payment status from URL search params
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get("payment");

    if (paymentStatus === "success") {
      toast.success("🎉 Payment successful! Welcome to Premium!");

      // Refresh user data if authenticated
      if (session) {
        queryClient.invalidateQueries({ queryKey: queryKeys.user });
      }

      // Clean up URL by removing payment parameter
      const url = new URL(window.location.href);
      url.searchParams.delete("payment");

      // Navigate to clean URL
      navigate({
        to: "/",
        search: {},
        replace: true,
      });
    }
  }, [navigate, queryClient, session]);

  return null;
}
