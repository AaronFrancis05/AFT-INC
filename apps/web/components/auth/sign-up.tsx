"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signUpSchema, type SignUpInput } from "@aft/auth/schemas";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@aft/ui/components/form";
import { Input } from "@aft/ui/components/input";
import { Button } from "@aft/ui/components/button";
import { SocialButtons } from "@/components/auth/social-buttons";
import { authClient } from "@aft/auth/client";
import type { SocialProvider } from "@aft/auth/providers";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import Image from "next/image";

export function SignUp({ socialProviders }: { socialProviders: SocialProvider[] }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(data: SignUpInput) {
    setIsLoading(true);
    await authClient.signUp.email(
      {
        email: data.email,
        password: data.password,
        name: data.name,
        callbackURL: "/dashboard",
      },
      {
        onSuccess: async () => {
          // Send OTP after successful signup
          await authClient.emailOtp.sendVerificationOtp(
            {
              email: data.email,
              type: "email-verification",
            },
            {
              onSuccess: () => {
                toast.success("Account created! Please check your email.");
                sessionStorage.setItem("verify_email", data.email);
                router.push("/auth/verify-email");
              },
              onError: () => {
                toast.error(
                  "Account created but failed to send verification email. Please try resending.",
                );
                sessionStorage.setItem("verify_email", data.email);
                router.push("/auth/verify-email");
                setIsLoading(false);
              },
            },
          );
        },
        onError: (ctx) => {
          form.setError("root", {
            message: ctx.error.message || "Signup failed",
          });
          toast.error(ctx.error.message);
          setIsLoading(false);
        },
      },
    );
  }

  async function handleSocialSignIn(provider: SocialProvider) {
    await authClient.signIn.social(
      {
        provider,
        callbackURL: "/dashboard",
      },
      {
        onSuccess: () => {
          toast.success(`Signed in with ${provider} successfully!`);
        },
        onError: (ctx) => {
          toast.error(ctx.error.message);
        },
      },
    );
  }

  return (
    <section className="flex min-h-screen bg-zinc-50 px-4 py-16 md:py-32 dark:bg-transparent">
      <div className="m-auto h-fit w-full max-w-md rounded-lg border bg-card p-0.5 shadow-md">
        <div className="p-8 pb-6">
          <Link href="/" aria-label="go home">
            <>
              {" "}
              <div className={"flex cursor-pointer items-center gap-2"}>
                <Image
                  className={"object-fit rounded-sm"}
                  src={"/assets/hero/robot.jpg"}
                  alt={"Logo"}
                  width={20}
                  height={20}
                />
                <h4 className={"font-sans text-lg font-bold"}>AFT INC</h4>
              </div>{" "}
            </>
          </Link>
          <h1 className="mt-4 mb-1 text-xl font-semibold">Create your account</h1>
          <p className="text-sm text-muted-foreground">
            Welcome! Please fill in your details to get started
          </p>

          {socialProviders.length > 0 && (
            <div className="mt-6">
              <SocialButtons
                providers={socialProviders}
                disabled={isLoading}
                onSelect={handleSocialSignIn}
              />
              <hr className="my-4 border-dashed" />
            </div>
          )}

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className={socialProviders.length > 0 ? "space-y-6" : "mt-6 space-y-6"}
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="block text-sm">Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="block text-sm">Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="you@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="text-sm">Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          className="pr-10"
                          {...field}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute top-0 right-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="sr-only">
                            {showPassword ? "Hide password" : "Show password"}
                          </span>
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="text-sm">Confirm Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="••••••••"
                          className="pr-10"
                          {...field}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute top-0 right-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="sr-only">
                            {showConfirmPassword ? "Hide password" : "Show password"}
                          </span>
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button className="w-full" type="submit" disabled={isLoading}>
                {isLoading ? "Creating account..." : "Continue"}
              </Button>
            </form>
          </Form>
        </div>

        <div className="rounded-lg border bg-muted p-3">
          <p className="text-center text-sm">
            Already have an account?
            <Button asChild variant="link" className="ml-3 px-2">
              <Link href="/auth/sign-in">Sign in</Link>
            </Button>
          </p>
        </div>
      </div>
    </section>
  );
}
