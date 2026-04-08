export interface MessageTemplate {
  id: string;
  name: string;
  guidelines: string;
  link1: string;
  link2: string;
  createdAt: string;
  builtIn?: boolean;
}

const KEY = "vo360_message_templates";

const DEFAULT_TEMPLATE: MessageTemplate = {
  id: "builtin-cold-outreach",
  name: "Cold Outreach — New Mover (VO360)",
  builtIn: true,
  createdAt: "2026-04-08T00:00:00.000Z",
  link1: "",
  link2: "",
  guidelines: `You are an expert direct-response copywriter for cold outreach in the home services industry.

Your job is to write a short, highly personalized outreach message to a homeowner or new mover that feels human, warm, relevant, and curiosity-driven. The goal is not to hard-sell — the goal is to get the lead to reply.

Write in natural American English.

Brand: VO360
Bonus offer (MANDATORY in every message): $1,500 in free showroom credits (1 credit = $1)
Tone: warm, personal, local, helpful

Requirements:
1. Start with a personalized congratulations on their new home or property.
2. Make the message feel like a thoughtful gift, not an advertisement.
3. Mention the main offer in one simple sentence.
4. Include the main link naturally.
5. Include the secondary link only if it fits smoothly.
6. Keep the message between 60 and 110 words (ultra-short variants under 40 words OK).
7. Do not sound pushy, spammy, or corporate.
8. You MUST explicitly mention $1,500 in free showroom credits and clarify that 1 credit = $1.
9. Do NOT use hype phrases like "limited time", "act now", or "exclusive deal".
10. End with one simple question that creates curiosity and makes it easy to reply.
11. Mix three styles across the batch: A) very natural and personal, B) slightly more promotional but still warm, C) ultra-short reply-focused.
12. Never mention equity, property value, ownership, or financial details.`,
};

export function loadTemplates(): MessageTemplate[] {
  if (typeof window === "undefined") return [DEFAULT_TEMPLATE];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      saveTemplates([DEFAULT_TEMPLATE]);
      return [DEFAULT_TEMPLATE];
    }
    const parsed = JSON.parse(raw) as MessageTemplate[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      saveTemplates([DEFAULT_TEMPLATE]);
      return [DEFAULT_TEMPLATE];
    }
    // Ensure built-in is always present
    if (!parsed.some((t) => t.id === DEFAULT_TEMPLATE.id)) {
      parsed.unshift(DEFAULT_TEMPLATE);
      saveTemplates(parsed);
    }
    return parsed;
  } catch {
    return [DEFAULT_TEMPLATE];
  }
}

export function saveTemplates(templates: MessageTemplate[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(templates));
  } catch {
    // ignore
  }
}

export function upsertTemplate(t: MessageTemplate) {
  const all = loadTemplates();
  const idx = all.findIndex((x) => x.id === t.id);
  if (idx >= 0) all[idx] = t;
  else all.push(t);
  saveTemplates(all);
}

export function deleteTemplate(id: string) {
  const all = loadTemplates().filter((t) => t.id !== id || t.builtIn);
  saveTemplates(all);
}
