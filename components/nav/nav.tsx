"use client"
import Image from 'next/image'
import { NAV_ITEMS } from '@/lib/constant'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"
import { Menu } from "lucide-react"

const Nav = () => {
    return (
        <>
        {/*    DESKTOP NAV*/}
        <div className={"py-6 bg-white border-black hidden md:flex gap-4 items-center justify-between px-8 "}>
            <div className={"flex gap-2 cursor-pointer items-center"}>
                <Image className={"rounded-sm"} src={"/assets/hero/robot.jpg"} alt={"Logo"} width={20} height={20} />
                <h4 className={"font-bold font-sans text-lg"}>AFT INC</h4>
            </div>

            <div className={"flex gap-4 items-center"}>
                {NAV_ITEMS.map((item) => (
                    <Link key={item.label} href={item.path} className="flex items-center gap-2 hover:text-blue-600 transition-colors">
                        <Image src={item.icon} alt={item.label} width={20} height={20} />
                        <span className="text-sm font-medium">{item.label}</span>
                    </Link>
                ))}
            </div>

            <div className={"flex gap-4 items-center cursor-pointer"}>
                <Link href="/auth/sign-in">
                    <Button variant="ghost" className={"cursor-pointer rounded-lg font-bold"}>Login</Button>
                </Link>
                <Link className={"bg-[#E5B83D] rounded-lg overflow-hidden cursor-pointer hover:opacity-70"} href="/auth/sign-up">
                    <Button className={"bg-[#E5B83D] cursor-pointer font-bold  "} >Get Started</Button>
                </Link>
            </div>
        </div>
         {/*   MOBILE NAV*/}
         <div className={"flex md:hidden py-4 px-6 justify-between items-center bg-white border-b"}>
             <div className={"flex gap-2 cursor-pointer items-center"}>
                 <Image className={"rounded-sm"} src={"/assets/hero/robot.jpg"} alt={"Logo"} width={20} height={20} />
                 <h4 className={"font-bold font-sans text-lg"}>AFT INC</h4>
             </div>

             <Sheet>
                 <SheetTrigger asChild>
                     <Button variant="ghost" size="icon">
                         <Menu className="h-6 w-6" />
                     </Button>
                 </SheetTrigger>
                 <SheetContent side="right" className="w-[300px] sm:w-[400px]">
                     <SheetHeader>
                         <SheetTitle className="text-left"><div className={"flex gap-2 cursor-pointer items-center"}>
                             <Image className={"rounded-sm"} src={"/assets/hero/robot.jpg"} alt={"Logo"} width={20} height={20} />
                             <h4 className={"font-bold font-sans text-lg"}>AFT INC</h4>
                         </div></SheetTitle>
                     </SheetHeader>
                     <div className="flex flex-col items-center gap-6 mt-8">
                         {NAV_ITEMS.map((item) => (
                             <Link key={item.label} href={item.path} className="flex items-center gap-4 hover:text-blue-600 transition-colors">
                                 <Image src={item.icon} alt={item.label} width={24} height={24} />
                                 <span className="text-lg font-medium">{item.label}</span>
                             </Link>
                         ))}
                         <hr className="my-2" />
                         <div className="flex flex-col gap-4 w-3/4">
                             <Link href="/auth/sign-in" className="w-full ">
                                 <Button variant="outline" className="w-full cursor-pointer justify-center rounded-lg font-bold">Login</Button>
                             </Link>
                             <Link href="/auth/sign-up" className="w-full ">
                                 <Button className="w-full justify-center cursor-pointer bg-[#E5B83D] hover:bg-[#E5B83D]/90 text-black font-bold rounded-lg">Get Started</Button>
                             </Link>
                         </div>
                     </div>
                 </SheetContent>
             </Sheet>
         </div>
        </>
    )
}
export default Nav
