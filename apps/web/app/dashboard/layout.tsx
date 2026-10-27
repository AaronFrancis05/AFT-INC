import { auth } from "@aft/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@aft/ui/components/sidebar";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { TooltipProvider } from "@aft/ui/components/tooltip";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/auth/sign-in");
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          user={{
            name: session.user.name,
            email: session.user.email,
            image: session.user.image,
          }}
        />
        <SidebarInset className="bg-muted/30">{children}</SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
