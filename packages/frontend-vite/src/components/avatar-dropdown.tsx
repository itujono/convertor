import {
  BookOpenIcon,
  ChevronDownIcon,
  LogOutIcon,
  HelpCircleIcon,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";
import { useAppSettings } from "@/hooks/use-app-settings";

export default function AvatarDropdown() {
  const { user, signOut, googleUser } = useAuth();
  const { formatPlanName } = useAppSettings();

  const handleSignOut = async () => {
    await signOut();
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (!user) return null;

  const displayName = googleUser?.name || user.name || "User";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <Avatar>
            <AvatarImage
              src={googleUser?.avatar_url}
              alt={`${displayName}'s profile`}
            />
            <AvatarFallback>
              {getInitials(displayName || user.email)}
            </AvatarFallback>
          </Avatar>
          <ChevronDownIcon
            size={16}
            className="opacity-60"
            aria-hidden="true"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-w-[30rem] min-w-64">
        <DropdownMenuLabel className="flex min-w-0 flex-col">
          <span className="text-foreground truncate text-sm font-medium">
            {displayName}
          </span>
          <span className="text-muted-foreground truncate text-xs font-normal">
            {user.email}
          </span>
          <span className="text-muted-foreground truncate text-xs font-normal mt-1">
            {formatPlanName()} Plan
          </span>
        </DropdownMenuLabel>
        {/* <DropdownMenuSeparator /> */}
        {/* <DropdownMenuGroup>
          <DropdownMenuItem>
            <UserIcon size={16} className="opacity-60" aria-hidden="true" />
            <span>Profile Settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <CreditCardIcon size={16} className="opacity-60" aria-hidden="true" />
            <span>Billing & Plans</span>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <BoltIcon size={16} className="opacity-60" aria-hidden="true" />
            <span>Usage & Limits</span>
          </DropdownMenuItem>
        </DropdownMenuGroup> */}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {/* <DropdownMenuItem>
            <SettingsIcon size={16} className="opacity-60" aria-hidden="true" />
            <span>Preferences</span>
          </DropdownMenuItem> */}
          <DropdownMenuItem disabled>
            <HelpCircleIcon
              size={16}
              className="opacity-60"
              aria-hidden="true"
            />
            <span>Help & Support</span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <BookOpenIcon size={16} className="opacity-60" aria-hidden="true" />
            <span>Documentation</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOutIcon size={16} className="opacity-60" aria-hidden="true" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
