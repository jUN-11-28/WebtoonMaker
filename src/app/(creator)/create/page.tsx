import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateWorkflow } from "./create-workflow";

export default async function CreatePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_approved, credits, display_name")
    .eq("id", user.id)
    .single();

  const p = profile as {
    is_approved: boolean;
    credits: number;
    display_name: string | null;
  } | null;

  // 미승인 안내
  if (!p?.is_approved) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
        <div className="max-w-sm text-center space-y-3">
          <div className="text-4xl">⏳</div>
          <h1 className="text-xl font-semibold">관리자 승인 대기 중</h1>
          <p className="text-sm text-muted-foreground">
            가입 신청이 접수되었습니다. 관리자가 계정을 승인하면 웹툰 생성 기능이 열립니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">웹툰 만들기</h1>
          <p className="text-sm text-muted-foreground mt-1">
            소설이나 스크립트를 붙여넣어 AI 웹툰을 생성하세요
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          보유 크레딧: <span className="font-semibold text-foreground">{p.credits}</span>
        </div>
      </div>
      <CreateWorkflow userId={user.id} credits={p.credits} />
    </div>
  );
}
