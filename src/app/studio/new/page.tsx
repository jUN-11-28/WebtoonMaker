import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewProjectForm } from "./new-project-form";

export default async function NewProjectPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_approved")
    .eq("id", user.id)
    .single();

  if (!(profile as { is_approved: boolean } | null)?.is_approved) redirect("/studio");

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">새 프로젝트</h1>
      <p className="text-sm text-muted-foreground mb-8">
        먼저 웹툰 제목과 스타일을 정하세요. 이후 캐릭터·장소를 구축하고 화별로 생성합니다.
      </p>
      <NewProjectForm />
    </div>
  );
}
