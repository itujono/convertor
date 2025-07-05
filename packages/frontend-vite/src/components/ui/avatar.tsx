import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    />
  );
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  const getAvatarUrl = (url?: string) => {
    if (!url) return undefined;

    if (url.includes("googleusercontent.com")) {
      const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url.replace(/=s\d+-c$/, "=s200-c"))}`;
      return proxyUrl;
    }

    return url;
  };

  const avatarUrl = getAvatarUrl(props.src as string);

  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn(
        "aspect-square size-full group-hover:opacity-80 transition-opacity",
        className
      )}
      src={avatarUrl}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-secondary flex size-full items-center justify-center rounded-[inherit] text-xs",
        className
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarFallback, AvatarImage };
