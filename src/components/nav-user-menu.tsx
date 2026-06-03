"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { User, Coins, ShieldCheck, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface NavUserMenuProps {
  displayName: string;
  role: "user" | "admin";
  isApproved: boolean;
  credits: number;
}

export function NavUserMenu({ displayName, role, isApproved, credits }: NavUserMenuProps) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <User className="h-4 w-4" />
          <span className="hidden sm:inline max-w-24 truncate">{displayName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <span className="font-medium truncate">{displayName}</span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Coins className="h-3 w-3" />
              <span>{credits} 크레딧</span>
              {!isApproved && (
                <span className="rounded-full bg-yellow-100 px-1.5 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                  승인 대기
                </span>
              )}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/my">
            <Settings className="mr-2 h-4 w-4" />
            마이페이지
          </Link>
        </DropdownMenuItem>
        {role === "admin" && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <ShieldCheck className="mr-2 h-4 w-4" />
              관리자
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
