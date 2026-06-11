/**
 * 크레딧 비용 상수 — 서버 전용.
 * 변경 시 여기만 수정하면 됨.
 */
export const CREDIT_COST = {
  generateJson: 1,       // Phase 1: story_json 생성
  generateReference: 1,  // Phase 2: 캐릭터/배경 레퍼런스 1장당
  generateCut: 3,        // Phase 3: 컷 이미지 1장당
} as const;

/** 에피소드 전체 예상 비용 계산 */
export function estimateTotalCost(opts: {
  characterCount: number;
  locationCount: number;
  cutCount: number;
}): number {
  return (
    CREDIT_COST.generateJson +
    opts.characterCount * CREDIT_COST.generateReference +
    opts.locationCount * CREDIT_COST.generateReference +
    opts.cutCount * CREDIT_COST.generateCut
  );
}
