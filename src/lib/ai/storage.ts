/**
 * 생성된 이미지 base64 → WebP 압축 → Supabase Storage 업로드 후 공개 URL 반환.
 * 서버 전용.
 */
import sharp from "sharp";
import { createServiceClient } from "@/lib/supabase/server";
import { invalidateImageCache } from "./image";

const BUCKET = "webtoon-images";

/** PNG/JPEG 등 → WebP 변환 + 최대 1200px 리사이즈 */
async function compressToWebP(base64: string): Promise<Buffer> {
  const input = Buffer.from(base64, "base64");
  return sharp(input)
    .resize({ width: 1200, height: 1800, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
}

export async function uploadBase64Image(
  base64: string,
  _mimeType: string,
  storagePath: string
): Promise<string> {
  const svc = createServiceClient();

  // 압축 + WebP 변환 (.png/.jpg 등 → .webp)
  const webpBuffer = await compressToWebP(base64);
  const finalPath = storagePath.replace(/\.(png|jpg|jpeg|gif|webp)$/i, ".webp");

  const { error } = await svc.storage
    .from(BUCKET)
    .upload(finalPath, webpBuffer, {
      contentType: "image/webp",
      upsert: true,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = svc.storage.from(BUCKET).getPublicUrl(finalPath);
  // upsert로 같은 URL의 내용이 바뀌었을 수 있으므로 다운로드 캐시 무효화
  invalidateImageCache(data.publicUrl);
  return data.publicUrl;
}
