import type { Cut, Scene, StoryJson } from "./story-schema";

export function buildCutPrompt(cut: Cut, scene: Scene, storyJson: StoryJson): string {
  const hasText =
    (cut.dialogue?.length ?? 0) + (cut.narration?.length ?? 0) + (cut.sfx?.length ?? 0) > 0;

  const characterBible = (storyJson.character_bible ?? [])
    .map(
      (c) =>
        `- ${c.name} (${c.char_key}): ${c.visual_core}. Wardrobe: ${c.wardrobe}. Expression: ${c.expression}.`
    )
    .join("\n");

  const dialogue = (cut.dialogue ?? [])
    .map((d) => {
      const pos = (d as typeof d & { bubble_position?: string }).bubble_position ?? "auto";
      return `- Speaker: ${d.character || "Narrator"}\n  Text: ${d.text}\n  Bubble position: ${pos}`;
    })
    .join("\n");

  const narration = (cut.narration ?? []).map((n) => `- ${n.text}`).join("\n");
  const sfx = (cut.sfx ?? []).map((s) => `- ${s.text}`).join("\n");

  const textRules = hasText
    ? `Text rendering mode:
- Render speech bubbles directly inside the image.
- Render all Korean dialogue exactly as provided.
- Render narration as clean rectangular narration boxes.
- Render SFX as Korean comic sound effect text.
- Follow bubble_position as closely as possible.
- Korean text must be readable, clean, and correctly spelled.
- Use natural Korean webtoon typography.
- Keep speech bubbles from covering important faces.
- If there is too much text, use smaller but readable bubbles.
- Do not invent new dialogue.
- Do not translate Korean text into English.`
    : `Clean artwork mode:
- Do not draw speech bubbles.
- Do not render Korean text inside the image.
- Leave clean empty space for speech bubbles.`;

  const panelType = cut.panel_type;
  const panelSizeHint =
    panelType === "wide"
      ? "LANDSCAPE orientation — establishing shot, environment/location emphasis."
      : panelType === "splash"
      ? "FULL-BLEED vertical portrait — maximum drama, climax or reveal panel."
      : panelType === "close"
      ? "CLOSE-UP — face or key detail fills most of the frame."
      : panelType === "insert"
      ? "SMALL INSERT PANEL — tight focus on an object, hand, or reaction detail."
      : "Standard vertical portrait panel."; // medium / default

  return `Create one Korean webtoon panel. Follow the visual prompt precisely — every detail matters.

=== PANEL INFO ===
Title: ${storyJson.project_title} / Episode: ${storyJson.episode}
Scene: ${scene.scene_id} — ${scene.description}
Cut: ${cut.cut_id} | Panel type: ${panelType} — ${panelSizeHint}
Camera: ${cut.camera}
Emotion / mood: ${cut.emotion}

=== VISUAL PROMPT (follow exactly) ===
${cut.visual_prompt}

=== CHARACTER REFERENCE ===
${characterBible || "- none"}

=== STYLE ===
Art style: ${storyJson.style_guide.art_style}
Color palette: ${storyJson.style_guide.color_palette}
Line weight: ${storyJson.style_guide.line_weight}
Overall mood: ${storyJson.style_guide.mood}

=== PANEL RULES ===
- Polished, finished Korean webtoon art — clean line art, soft cel shading, cinematic composition.
- Every element in the visual prompt MUST appear: time of day, weather, lighting quality, background objects, spatial depth, character poses, facial expressions.
- If the prompt mentions daytime/night/rain/indoor lighting — make it unmistakably clear in the image.
- Characters must match their character_bible descriptions exactly (hair, face, outfit) across all panels.
- Depth of field: foreground subjects sharp, background atmospheric.

=== TEXT RENDERING ===
${textRules}

Dialogue:
${dialogue || "- none"}

Narration:
${narration || "- none"}

SFX:
${sfx || "- none"}

=== NEGATIVE PROMPT ===
${storyJson.style_guide.global_negative_prompt}`.trim();
}
