import Image from "next/image";
import Nav from "@/components/nav/nav";
import { Button } from "@aft/ui/components/button";
import Link from "next/link";
import { Globe, Layout, ShoppingCart, Server, Code, HeadphonesIcon } from "lucide-react";

export default function Home() {
  return (
    <main className={"min-h-screen bg-[#DED5D5]"}>
      <Nav />
      {/*Banner Section*/}
      <div className={"flex w-full items-center justify-between gap-2 px-20 pt-20 sm:gap-4"}>
        {/*Banner Info*/}
        <div className={"flex max-w-2xl flex-col gap-6"}>
          <h1 className={"text-6xl leading-tight font-extrabold text-black"}>
            The Ultimate Expo for <span className={"text-[#E5B83D]"}>Modern Web Projects</span>
          </h1>
          <p className={"text-lg font-medium text-gray-700"}>
            Discover a curated collection of cutting-edge web applications. From powerful SaaS
            platforms and flexible CMS solutions to high-performance E-commerce sites and beyond –
            we showcase the best in modern web development.
          </p>
          <div className={"flex items-center gap-2"}>
            <Link href="/projects">
              <Button
                className={
                  "rounded-xl bg-black px-8 py-6 text-lg font-bold text-white transition-all hover:bg-gray-800"
                }
              >
                Explore Projects
              </Button>
            </Link>
            <Link href="/services">
              <Button
                variant="outline"
                className={
                  "rounded-xl border-2 border-black px-8 py-6 text-lg font-bold transition-all hover:bg-black hover:text-white"
                }
              >
                Our Services
              </Button>
            </Link>
          </div>
        </div>
        {/*Banner Image*/}
        <div className={"relative max-sm:hidden"}>
          <div className={"relative z-10 max-sm:hidden"}>
            <Image
              className={"rounded-xl shadow-2xl max-sm:hidden"}
              src={"/assets/banner/banner.png"}
              width={600}
              height={700}
              alt={"Banner"}
            />
          </div>
          {/* Decorative element */}
          <div
            className={
              "absolute -top-4 -right-4 -z-0 h-full w-full rounded-xl border-4 border-[#E5B83D] max-sm:hidden"
            }
          ></div>
        </div>
      </div>

      {/*Projects Section*/}
      <div className={"w-full px-20 py-25"}>
        <div className={"mb-12 flex flex-col gap-2 sm:gap-4"}>
          <h2 className={"text-4xl font-bold text-black"}>Featured Projects</h2>
          <p className={"max-w-xl text-gray-600"}>
            Explore our top-tier web applications, from SaaS platforms to high-performance
            E-commerce solutions.
          </p>
        </div>

        <div className={"grid grid-cols-1 gap-5 sm:gap-8 md:grid-cols-2 lg:grid-cols-3"}>
          {PROJECTS.map((project, index) => (
            <div
              key={index}
              className={
                "group flex flex-col overflow-hidden rounded-2xl bg-white shadow-lg transition-all duration-300 hover:shadow-2xl"
              }
            >
              <div className={"relative h-56 w-full overflow-hidden"}>
                <Image
                  src={project.image}
                  alt={project.title}
                  fill
                  className={"object-cover transition-transform duration-500 group-hover:scale-105"}
                />
                <div className={"absolute top-4 left-4"}>
                  <span
                    className={
                      "rounded-full bg-black/70 px-3 py-1 text-xs font-bold tracking-wider text-white uppercase backdrop-blur-md"
                    }
                  >
                    {project.category}
                  </span>
                </div>
              </div>
              <div className={"flex flex-grow flex-col gap-4 p-6"}>
                <h3 className={"text-xl font-bold text-black"}>{project.title}</h3>
                <p className={"line-clamp-3 flex-grow text-sm text-gray-600"}>
                  {project.description}
                </p>
                <Link href={`/projects/${project.id}`}>
                  <Button
                    className={
                      "w-full rounded-xl bg-[#E5B83D] font-bold text-black transition-all hover:bg-black hover:text-white"
                    }
                  >
                    Browse Project
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/*    SERVICES SECTION*/}
      <div className={"w-full bg-white/30 px-20 py-24 backdrop-blur-sm"}>
        <div className={"mb-16 flex flex-col items-center gap-4 text-center"}>
          <h2 className={"text-4xl font-bold text-black"}>Our Specialized Services</h2>
          <p className={"max-w-2xl text-lg text-gray-700"}>
            From initial concept to final deployment, we provide end-to-end solutions for all your
            digital needs. Get custom domains, high-performance hosting, and expert development all
            in one place.
          </p>
        </div>

        <div className={"grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3"}>
          {SERVICES.map((service, index) => (
            <div
              key={index}
              className={
                "group rounded-2xl border border-transparent bg-white p-8 shadow-md transition-all duration-300 hover:border-[#E5B83D] hover:shadow-xl"
              }
            >
              <div
                className={
                  "mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-[#E5B83D]/10 transition-colors duration-300 group-hover:bg-[#E5B83D]"
                }
              >
                <service.icon
                  className={
                    "h-8 w-8 text-[#E5B83D] transition-colors duration-300 group-hover:text-black"
                  }
                />
              </div>
              <h3 className={"mb-3 text-xl font-bold text-black"}>{service.title}</h3>
              <p className={"leading-relaxed text-gray-600"}>{service.description}</p>
            </div>
          ))}
        </div>

        <div
          className={
            "mt-16 flex flex-col items-center justify-between gap-8 rounded-3xl bg-black p-12 md:flex-row"
          }
        >
          <div className={"text-white"}>
            <h3 className={"mb-2 text-3xl font-bold"}>Ready to start your next project?</h3>
            <p className={"text-gray-400"}>
              Contact us today for a free consultation and custom quote.
            </p>
          </div>
          <Link href="/services">
            <Button
              className={
                "rounded-xl bg-[#E5B83D] px-10 py-7 text-lg font-bold text-black transition-all hover:bg-white"
              }
            >
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
    description:
      "A comprehensive analytics dashboard for modern SaaS businesses, featuring real-time data visualization and churn prediction.",
    image:
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop",
  },
  {
    id: "nova-cms",
    title: "Nova headless CMS",
    category: "CMS",
    description:
      "An API-first headless content management system designed for speed and flexibility across multiple platforms.",
    image:
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=2015&auto=format&fit=crop",
  },
  {
    id: "lux-store",
    title: "LuxEcom Storefront",
    category: "E-Commerce",
    description:
      "A high-performance luxury e-commerce platform with seamless payment integration and AI-driven recommendations.",
    image:
      "https://images.unsplash.com/photo-1472851294608-062f824d29cc?q=80&w=2070&auto=format&fit=crop",
  },
  {
    id: "dev-hub",
    title: "DevHub Community",
    category: "Platform",
    description:
      "A collaborative platform for developers to share snippets, project roadmaps, and peer code reviews in real-time.",
    image:
      "https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=2070&auto=format&fit=crop",
  },
  {
    id: "fin-edge",
    title: "FinEdge Banking",
    category: "FinTech",
    description:
      "Next-generation digital banking experience with multi-currency support and automated budgeting tools.",
    image:
      "https://images.unsplash.com/photo-1563986768609-322da13575f3?q=80&w=2070&auto=format&fit=crop",
  },
  {
    id: "nexus-portfolio",
    title: "Nexus Portfolio",
    category: "Portfolio",
    description:
      "Minimalist and interactive portfolio template for designers and creatives looking to showcase their best work.",
    image:
      "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?q=80&w=1955&auto=format&fit=crop",
  },
];

const SERVICES = [
  {
    title: "Custom Web Development",
    description:
      "Specializing in SaaS platforms, Headless CMS, and high-performance E-commerce solutions tailored to your business needs.",
    icon: Code,
  },
  {
    title: "Domain & SSL",
    description:
      "We handle custom domain registration and SSL certificate setup to ensure your site is professional and secure from day one.",
    icon: Globe,
  },
  {
    title: "Premium Hosting",
    description:
      "Lightning-fast, reliable hosting solutions with 99.9% uptime guarantee and automated backups for peace of mind.",
    icon: Server,
  },
  {
    title: "UI/UX Design",
    description:
      "Modern, intuitive designs focused on user experience and conversion, ensuring your project looks great on all devices.",
    icon: Layout,
  },
  {
    title: "E-Commerce Solutions",
    description:
      "Full-scale online stores with secure payment gateways, inventory management, and seamless checkout experiences.",
    icon: ShoppingCart,
  },
  {
    title: "Support & Maintenance",
    description:
      "Dedicated technical support and regular maintenance updates to keep your web applications running smoothly and securely.",
    icon: HeadphonesIcon,
  },
];
