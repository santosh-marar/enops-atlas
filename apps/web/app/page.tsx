import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-background dark:text-white">
      <Button asChild>
        <Link href={"/editor"}>Try dbml editor</Link>
      </Button>
    </main>
  );
}
