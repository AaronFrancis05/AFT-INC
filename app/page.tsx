import Image from "next/image";
import Nav from'@/components/nav/nav'
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { 
    Globe, 
    Layout, 
    ShoppingCart, 
    Server, 
    ShieldCheck, 
    Zap,
    Code,
    Settings,
    HeadphonesIcon
} from "lucide-react";

export default function Home() {
  return (
    <main className={"min-h-screen bg-[#DED5D5] "}>
        <Nav />
        {/*Banner Section*/}
        <div className={"px-20 flex items-center justify-between gap-2 sm:gap-4 pt-20 w-full"}>
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
                    <div className={"flex gap-2 items-center"}>
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
                <div className={"relative max-sm:hidden"}>
                    <div className={"relative z-10 max-sm:hidden"}>
                        <Image className={"rounded-xl shadow-2xl max-sm:hidden"} src={"/assets/banner/banner.png"} width={600} height={700} alt={"Banner"}/>
                    </div>
                    {/* Decorative element */}
                    <div className={"absolute -top-4 -right-4 w-full h-full border-4 border-[#E5B83D] rounded-xl -z-0 max-sm:hidden"}></div>
                </div>
        </div>

        {/*Projects Section*/}
        <div className={"px-20 py-25 w-full"}>
            <div className={"flex flex-col gap-2 sm:gap-4 mb-12"}>
                <h2 className={"text-4xl font-bold text-black"}>Featured Projects</h2>
                <p className={"text-gray-600 max-w-xl"}>Explore our top-tier web applications, from SaaS platforms to high-performance E-commerce solutions.</p>
            </div>
            
            <div className={"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-8"}>
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
        
    {/*    SERVICES SECTION*/}
        <div className={"px-20 py-24 w-full bg-white/30 backdrop-blur-sm"}>
            <div className={"flex flex-col items-center text-center gap-4 mb-16"}>
                <h2 className={"text-4xl font-bold text-black"}>Our Specialized Services</h2>
                <p className={"text-gray-700 max-w-2xl text-lg"}>
                    From initial concept to final deployment, we provide end-to-end solutions for all your digital needs. 
                    Get custom domains, high-performance hosting, and expert development all in one place.
                </p>
            </div>

            <div className={"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"}>
                {SERVICES.map((service, index) => (
                    <div key={index} className={"bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 border border-transparent hover:border-[#E5B83D] group"}>
                        <div className={"w-14 h-14 bg-[#E5B83D]/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-[#E5B83D] transition-colors duration-300"}>
                            <service.icon className={"w-8 h-8 text-[#E5B83D] group-hover:text-black transition-colors duration-300"} />
                        </div>
                        <h3 className={"text-xl font-bold text-black mb-3"}>{service.title}</h3>
                        <p className={"text-gray-600 leading-relaxed"}>
                            {service.description}
                        </p>
                    </div>
                ))}
            </div>

            <div className={"mt-16 bg-black rounded-3xl p-12 flex flex-col md:flex-row items-center justify-between gap-8"}>
                <div className={"text-white"}>
                    <h3 className={"text-3xl font-bold mb-2"}>Ready to start your next project?</h3>
                    <p className={"text-gray-400"}>Contact us today for a free consultation and custom quote.</p>
                </div>
                <Link href="/services">
                    <Button className={"bg-[#E5B83D] text-black hover:bg-white px-10 py-7 rounded-xl font-bold text-lg transition-all"}>
                        Get Started Now
                    </Button>
                </Link>
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
];

const SERVICES = [
    {
        title: "Custom Web Development",
        description: "Specializing in SaaS platforms, Headless CMS, and high-performance E-commerce solutions tailored to your business needs.",
        icon: Code
    },
    {
        title: "Domain & SSL",
        description: "We handle custom domain registration and SSL certificate setup to ensure your site is professional and secure from day one.",
        icon: Globe
    },
    {
        title: "Premium Hosting",
        description: "Lightning-fast, reliable hosting solutions with 99.9% uptime guarantee and automated backups for peace of mind.",
        icon: Server
    },
    {
        title: "UI/UX Design",
        description: "Modern, intuitive designs focused on user experience and conversion, ensuring your project looks great on all devices.",
        icon: Layout
    },
    {
        title: "E-Commerce Solutions",
        description: "Full-scale online stores with secure payment gateways, inventory management, and seamless checkout experiences.",
        icon: ShoppingCart
    },
    {
        title: "Support & Maintenance",
        description: "Dedicated technical support and regular maintenance updates to keep your web applications running smoothly and securely.",
        icon: HeadphonesIcon
    }
];
