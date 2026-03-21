import Image from "next/image";
import Nav from'@/components/nav/nav'
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  return (
    <main className={"min-h-screen bg-[#DED5D5] "}>
        <Nav />
        {/*Banner Section*/}
        <div className={"px-20 flex items-center justify-between gap-4 pt-20 w-full"}>
                {/*Banner Info*/}
                <div className={"flex flex-col gap-6 max-w-2xl"}>
                    <h1 className={"text-6xl font-extrabold text-black leading-tight"}>
                        The Ultimate Expo for <span className={"text-[#E5B83D]"}>Modern Web Projects</span>
                    </h1>
                    <p className={"text-lg text-gray-700 font-medium"}>
                        Discover a curated collection of cutting-edge web applications. 
                        From powerful SaaS platforms and flexible CMS solutions to high-performance E-commerce sites 
                        and beyond – we showcase the best in modern web development.
                    </p>
                    <div className={"flex gap-4 items-center"}>
                        <Link href="/projects">
                            <Button className={"bg-black text-white px-8 py-6 rounded-xl font-bold text-lg hover:bg-gray-800 transition-all"}>
                                Explore Projects
                            </Button>
                        </Link>
                        <Link href="/services">
                            <Button variant="outline" className={"border-2 border-black px-8 py-6 rounded-xl font-bold text-lg hover:bg-black hover:text-white transition-all"}>
                                Our Services
                            </Button>
                        </Link>
                    </div>
                </div>
                {/*Banner Image*/}
                <div className={"relative"}>
                    <div className={"relative z-10"}>
                        <Image className={"rounded-xl shadow-2xl"} src={"/assets/banner/banner.png"} width={600} height={700} alt={"Banner"}/>
                    </div>
                    {/* Decorative element */}
                    <div className={"absolute -top-4 -right-4 w-full h-full border-4 border-[#E5B83D] rounded-xl -z-0"}></div>
                </div>
        </div>
    </main>
  );
}
