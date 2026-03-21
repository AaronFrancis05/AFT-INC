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

        {/*Projects Section*/}
        <div className={"px-20 py-20 w-full"}>
            <div className={"flex flex-col gap-4 mb-12"}>
                <h2 className={"text-4xl font-bold text-black"}>Featured Projects</h2>
                <p className={"text-gray-600 max-w-xl"}>Explore our top-tier web applications, from SaaS platforms to high-performance E-commerce solutions.</p>
            </div>
            
            <div className={"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"}>
                {PROJECTS.map((project, index) => (
                    <div key={index} className={"bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col group"}>
                        <div className={"relative h-56 w-full overflow-hidden"}>
                            <Image 
                                src={project.image} 
                                alt={project.title} 
                                fill 
                                className={"object-cover group-hover:scale-105 transition-transform duration-500"}
                            />
                            <div className={"absolute top-4 left-4"}>
                                <span className={"bg-black/70 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"}>
                                    {project.category}
                                </span>
                            </div>
                        </div>
                        <div className={"p-6 flex flex-col flex-grow gap-4"}>
                            <h3 className={"text-xl font-bold text-black"}>{project.title}</h3>
                            <p className={"text-gray-600 text-sm line-clamp-3 flex-grow"}>
                                {project.description}
                            </p>
                            <Link href={`/projects/${project.id}`}>
                                <Button className={"w-full bg-[#E5B83D] text-black hover:bg-black hover:text-white font-bold rounded-xl transition-all"}>
                                    Browse Project
                                </Button>
                            </Link>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    </main>
);
}

const PROJECTS = [
    {
        id: "saas-flow",
        title: "SaaSFlow Analytics",
        category: "SaaS",
        description: "A comprehensive analytics dashboard for modern SaaS businesses, featuring real-time data visualization and churn prediction.",
        image: "https://images.unsplash.com/photo-1551288049-bbda4865cda1?q=80&w=2070&auto=format&fit=crop"
    },
    {
        id: "nova-cms",
        title: "Nova headless CMS",
        category: "CMS",
        description: "An API-first headless content management system designed for speed and flexibility across multiple platforms.",
        image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=2015&auto=format&fit=crop"
    },
    {
        id: "lux-store",
        title: "LuxEcom Storefront",
        category: "E-Commerce",
        description: "A high-performance luxury e-commerce platform with seamless payment integration and AI-driven recommendations.",
        image: "https://images.unsplash.com/photo-1472851294608-062f824d29cc?q=80&w=2070&auto=format&fit=crop"
    },
    {
        id: "dev-hub",
        title: "DevHub Community",
        category: "Platform",
        description: "A collaborative platform for developers to share snippets, project roadmaps, and peer code reviews in real-time.",
        image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=2070&auto=format&fit=crop"
    },
    {
        id: "fin-edge",
        title: "FinEdge Banking",
        category: "FinTech",
        description: "Next-generation digital banking experience with multi-currency support and automated budgeting tools.",
        image: "https://images.unsplash.com/photo-1563986768609-322da13575f3?q=80&w=2070&auto=format&fit=crop"
    },
    {
        id: "nexus-portfolio",
        title: "Nexus Portfolio",
        category: "Portfolio",
        description: "Minimalist and interactive portfolio template for designers and creatives looking to showcase their best work.",
        image: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?q=80&w=1955&auto=format&fit=crop"
    }
]
