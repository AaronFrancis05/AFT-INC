"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@aft/ui/components/button";
import { authClient } from "@aft/auth/client";
import { toast } from "sonner";
import { LogOut } from "lucide-react";

interface LogoutButtonProps {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  showIcon?: boolean;
  className?: string;
}

export function LogoutButton({
  variant = "outline",
  size = "default",
  showIcon = true,
  className,
}: LogoutButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
    setIsLoading(true);
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          toast.success("Logged out successfully");
          router.push("/auth/sign-in");
        },
        onError: (ctx) => {
          toast.error(ctx.error.message || "Failed to logout");
          setIsLoading(false);
        },
      },
    });
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleLogout}
      disabled={isLoading}
      className={className}
    >
      {showIcon && <LogOut className="mr-2 h-4 w-4" />}
      {isLoading ? "Logging out..." : "Logout"}
    </Button>
  );
}
