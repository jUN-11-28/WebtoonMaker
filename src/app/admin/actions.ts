"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile as { role: string }).role !== "admin") {
    throw new Error("Forbidden");
  }
}

export async function approveUser(userId: string) {
  await assertAdmin();
  const svc = createServiceClient();
  const { error } = await svc
    .from("profiles")
    .update({ is_approved: true })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function rejectUser(userId: string) {
  await assertAdmin();
  const svc = createServiceClient();
  const { error } = await svc
    .from("profiles")
    .update({ is_approved: false })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function adjustCredits(userId: string, delta: number) {
  await assertAdmin();
  if (!Number.isInteger(delta) || delta === 0) throw new Error("Invalid delta");

  const svc = createServiceClient();
  // adjust_credits RPC — 원자적 처리, 잔액 부족 시 예외
  const { error } = await svc.rpc("adjust_credits", {
    target_user_id: userId,
    delta,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function deleteComment(commentId: string) {
  await assertAdmin();
  const svc = createServiceClient();
  const { error } = await svc.from("comments").delete().eq("id", commentId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}
