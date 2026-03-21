import Image from "next/image";
import Nav from'@/components/nav/nav'

export default function Home() {
  return (
    <main className={"min-h-screen bg-[#DED5D5] "}>
        <Nav />
        <h1> Home</h1>
    </main>
  );
}
