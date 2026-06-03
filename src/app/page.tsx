import { Button } from "@/components/ui/button";
import { Sparkles, BookOpen, Users, Zap } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/explore");
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-4 py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground mb-6">
          <Sparkles className="h-3 w-3" />
          AI 기반 웹툰 생성 플랫폼
        </div>
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          소설을 웹툰으로,
          <br />
          <span className="text-muted-foreground">AI가 한 번에</span>
        </h1>
        <p className="mt-6 max-w-lg text-lg text-muted-foreground">
          텍스트를 붙여넣으면 AI가 컷을 분할하고, 캐릭터를 고정하고,
          웹툰 이미지를 자동으로 생성합니다.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link href="/explore">웹툰 둘러보기</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/signup">무료로 시작하기</Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="border-t px-4 py-16">
        <div className="mx-auto max-w-screen-lg">
          <h2 className="text-center text-2xl font-semibold mb-10">
            어떻게 작동하나요?
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-6">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">① 소설·스크립트 입력</h3>
              <p className="text-sm text-muted-foreground">
                산문 소설이나 시나리오 스크립트를 붙여넣으세요.
                AI가 자동으로 씬과 컷을 분석합니다.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-6">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">② 캐릭터·배경 고정</h3>
              <p className="text-sm text-muted-foreground">
                레퍼런스 이미지를 먼저 생성해 캐릭터 외형을 고정합니다.
                컷마다 같은 캐릭터가 일관되게 등장합니다.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-6">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">③ 웹툰 자동 생성</h3>
              <p className="text-sm text-muted-foreground">
                레퍼런스 이미지를 참조해 각 컷의 이미지를 생성하고
                완성된 웹툰을 공유하세요.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t px-4 py-16 text-center">
        <h2 className="text-2xl font-semibold mb-4">지금 바로 만들어 보세요</h2>
        <p className="text-muted-foreground mb-6">
          회원가입 후 관리자 승인을 받으면 크레딧으로 웹툰을 생성할 수 있습니다.
        </p>
        <Button size="lg" asChild>
          <Link href="/signup">시작하기 →</Link>
        </Button>
      </section>
    </div>
  );
}
