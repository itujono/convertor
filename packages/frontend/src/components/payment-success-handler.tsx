"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

export function PaymentSuccessHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { refreshUser } = useAuth();

  useEffect(() => {
    const paymentStatus = searchParams.get("payment");

    if (paymentStatus === "success") {
      toast.success("🎉 Payment successful! Welcome to Premium!");

      refreshUser();

      const url = new URL(window.location.href);
      url.searchParams.delete("payment");
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }, [searchParams, router, refreshUser]);

  return null;
}
