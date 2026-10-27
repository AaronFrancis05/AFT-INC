"use client";
import Image from "next/image";
import { NAV_ITEMS } from "@/lib/constant";
import Link from "next/link";
import { Button } from "@aft/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@aft/ui/components/sheet";
import { Menu } from "lucide-react";

const Nav = () => {
  return (
    <>
      {/*    DESKTOP NAV*/}
      <div
        className={
          "hidden items-center justify-between gap-4 border-black bg-white px-8 py-6 md:flex"
        }
      >
        <div className={"flex cursor-pointer items-center gap-2"}>
          <Image
            className={"rounded-sm"}
            src={"/assets/hero/robot.jpg"}
            alt={"Logo"}
            width={20}
            height={20}
          />
          <h4 className={"font-sans text-lg font-bold"}>AFT INC</h4>
        </div>

        <div className={"flex items-center gap-4"}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.path}
              className="flex items-center gap-2 transition-colors hover:text-blue-600"
            >
              <Image src={item.icon} alt={item.label} width={20} height={20} />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          ))}
        </div>

        <div className={"flex cursor-pointer items-center gap-4"}>
          <Link href="/auth/sign-in">
            <Button variant="ghost" className={"cursor-pointer rounded-lg font-bold"}>
              Login
            </Button>
          </Link>
          <Link
            className={"cursor-pointer overflow-hidden rounded-lg bg-[#E5B83D] hover:opacity-70"}
            href="/auth/sign-up"
          >
            <Button className={"cursor-pointer bg-[#E5B83D] font-bold"}>Get Started</Button>
          </Link>
        </div>
      </div>
      {/*   MOBILE NAV*/}
      <div className={"flex items-center justify-between border-b bg-white px-6 py-4 md:hidden"}>
        <div className={"flex cursor-pointer items-center gap-2"}>
          <Image
            className={"rounded-sm"}
            src={"/assets/hero/robot.jpg"}
            alt={"Logo"}
            width={20}
            height={20}
          />
          <h4 className={"font-sans text-lg font-bold"}>AFT INC</h4>
        </div>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[300px] sm:w-[400px]">
            <SheetHeader>
              <SheetTitle className="text-left">
                <div className={"flex cursor-pointer items-center gap-2"}>
                  <Image
                    className={"rounded-sm"}
                    src={"/assets/hero/robot.jpg"}
                    alt={"Logo"}
                    width={20}
                    height={20}
                  />
                  <h4 className={"font-sans text-lg font-bold"}>AFT INC</h4>
                </div>
              </SheetTitle>
            </SheetHeader>
            <div className="mt-8 flex flex-col items-center gap-6">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.label}
                  href={item.path}
                  className="flex items-center gap-4 transition-colors hover:text-blue-600"
                >
                  <Image src={item.icon} alt={item.label} width={24} height={24} />
                  <span className="text-lg font-medium">{item.label}</span>
                </Link>
              ))}
              <hr className="my-2" />
              <div className="flex w-3/4 flex-col gap-4">
                <Link href="/auth/sign-in" className="w-full">
                  <Button
                    variant="outline"
                    className="w-full cursor-pointer justify-center rounded-lg font-bold"
                  >
                    Login
                  </Button>
                </Link>
                <Link href="/auth/sign-up" className="w-full">
                  <Button className="w-full cursor-pointer justify-center rounded-lg bg-[#E5B83D] font-bold text-black hover:bg-[#E5B83D]/90">
                    Get Started
                  </Button>
                </Link>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
};
export default Nav;
