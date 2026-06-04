import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NavUserMenu } from "@/components/nav-user-menu";

type ProfileSnippet = {
  display_name: string | null;
  role: "user" | "admin";
  is_approved: boolean;
  credits: number;
};

export async function Navbar() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let profile: ProfileSnippet | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("display_name, role, is_approved, credits")
      .eq("id", user.id)
      .single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    profile = data ? (data as any as ProfileSnippet) : null;
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-xl mx-auto items-center px-4">
        <div className="flex items-center gap-2 mr-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Image src="/logo.png" alt="웹툰메이커" width={24} height={24} className="rounded-sm" />
            <span className="text-base tracking-tight">웹툰메이커</span>
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-1 flex-1">
          {!user && (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/explore">
                <BookOpen className="h-4 w-4 mr-1" />
                탐색
              </Link>
            </Button>
          )}
        </nav>

        <div className="flex items-center gap-2 ml-auto">
          <ThemeToggle />
          {user && profile ? (
            <NavUserMenu
              displayName={profile.display_name ?? user.email ?? ""}
              role={profile.role}
              isApproved={profile.is_approved}
              credits={profile.credits}
            />
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">로그인</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/signup">가입하기</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
