import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ApproveButtons } from "./approve-buttons";
import { CreditForm } from "./credit-form";

export default async function AdminPage() {
  // role 검증 — 서버에서
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!me || (me as { role: string }).role !== "admin") redirect("/");

  // service role로 전체 사용자 조회
  const svc = createServiceClient();
  const { data: allUsers } = await svc
    .from("profiles")
    .select("id, email, display_name, role, is_approved, credits, created_at")
    .order("created_at", { ascending: false });

  const users = (allUsers ?? []) as {
    id: string;
    email: string;
    display_name: string | null;
    role: string;
    is_approved: boolean;
    credits: number;
    created_at: string;
  }[];

  const pending = users.filter((u) => !u.is_approved && u.role !== "admin");
  const approved = users.filter((u) => u.is_approved || u.role === "admin");

  return (
    <div className="mx-auto max-w-screen-lg px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">관리자 대시보드</h1>
      <p className="text-sm text-muted-foreground mb-8">
        가입 승인 및 크레딧 관리
      </p>

      {/* 승인 대기 */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          승인 대기
          {pending.length > 0 && (
            <Badge variant="destructive">{pending.length}</Badge>
          )}
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">대기 중인 사용자가 없습니다.</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">닉네임</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">이메일</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">가입일</th>
                  <th className="text-right px-4 py-3 font-medium">처리</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((u, i) => (
                  <tr key={u.id} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                    <td className="px-4 py-3">
                      <span className="font-medium">{u.display_name ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {u.email}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {new Date(u.created_at).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ApproveButtons userId={u.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Separator className="mb-10" />

      {/* 전체 사용자 크레딧 관리 */}
      <section>
        <h2 className="text-lg font-semibold mb-4">사용자 관리</h2>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">닉네임</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">이메일</th>
                <th className="text-center px-4 py-3 font-medium">상태</th>
                <th className="text-center px-4 py-3 font-medium">크레딧</th>
                <th className="text-right px-4 py-3 font-medium">크레딧 조정</th>
              </tr>
            </thead>
            <tbody>
              {approved.map((u, i) => (
                <tr key={u.id} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{u.display_name ?? "—"}</span>
                      {u.role === "admin" && (
                        <Badge variant="secondary" className="text-xs">관리자</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {u.email}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={u.is_approved ? "default" : "outline"}>
                      {u.is_approved ? "승인" : "대기"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center font-mono font-medium">
                    {u.credits}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <CreditForm userId={u.id} currentCredits={u.credits} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
