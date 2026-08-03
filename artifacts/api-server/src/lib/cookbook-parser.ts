import { unzipSync } from "fflate";

/**
 * Parser for Ray's Drive "cookbook" folder export.
 *
 * Google Drive exports each recipe as its own document. The real export ships
 * `.md.docx` files (markdown authored, exported as Word), so both docx and raw
 * markdown are normalized into the same `Block[]` shape and classified by one
 * set of rules. Everything downstream works on blocks, not file formats.
 *
 * The cardinal rule for this importer: never invent data. A quantity or unit is
 * only filled in when the source line states one outright — otherwise it lands
 * blank for Ray to fill in himself.
 */

/** A heading level of 0 means "body paragraph". */
export interface Block {
  heading: 0 | 1 | 2 | 3;
  isListItem: boolean;
  text: string;
}

export interface ParsedIngredient {
  name: string;
  /** "" when the source document doesn't state one. */
  quantity: string;
  /** "" when the source document doesn't state one. */
  unit: string;
}

export interface ParsedRecipe {
  name: string;
  description: string;
  instructions: string[];
  ingredients: ParsedIngredient[];
}

export type SkipReason =
  | "meal-plan-directive"
  | "no-recipe-structure"
  | "no-ingredients"
  | "unsupported-file"
  | "unreadable";

export type DocOutcome =
  | { kind: "recipe"; fileName: string; recipe: ParsedRecipe }
  | { kind: "skipped"; fileName: string; reason: SkipReason; detail: string };

export interface UploadedFile {
  fileName: string;
  bytes: Uint8Array;
}

// ─── Format normalization ────────────────────────────────────────────────────

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXmlText(raw: string): string {
  return raw
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m]);
}

function headingLevelFromStyle(style: string): 0 | 1 | 2 | 3 {
  const normalized = style.toLowerCase().replace(/\s/g, "");
  if (normalized === "title" || normalized === "heading1") return 1;
  if (normalized === "heading2") return 2;
  // Heading 3 and anything deeper collapse to 3 — the cookbook never nests further,
  // and treating a stray Heading4 as body text would drop an Ingredients label.
  if (/^heading[3-9]$/.test(normalized)) return 3;
  return 0;
}

/**
 * Pulls paragraphs out of a .docx.
 *
 * A docx is a zip whose `word/document.xml` holds the body. Google's exporter
 * emits a narrow, predictable subset (styled paragraphs + numbered lists), so
 * the paragraph/run structure is read directly rather than pulling in a full
 * XML parser for markup this constrained.
 */
export function parseDocxBlocks(bytes: Uint8Array): Block[] {
  const entries = unzipSync(bytes);
  const documentXml = entries["word/document.xml"];
  if (!documentXml) throw new Error("No word/document.xml — not a Word document");

  const xml = new TextDecoder().decode(documentXml);
  const blocks: Block[] = [];

  // Self-closing <w:p/> paragraphs carry no text; the [\s\S]*? body form skips them.
  for (const match of xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const paragraph = match[1];

    // Properties live in <w:pPr>; a <w:pStyle> inside a run would be a false positive.
    const props = /<w:pPr(?:\s[^>]*)?>([\s\S]*?)<\/w:pPr>/.exec(paragraph)?.[1] ?? "";
    const style = /<w:pStyle\s[^>]*w:val="([^"]*)"/.exec(props)?.[1] ?? "";
    const isListItem = /<w:numPr[\s>]/.test(props);

    let text = "";
    for (const run of paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)) {
      text += decodeXmlText(run[1]);
    }
    // <w:tab/> and <w:br/> separate runs visually; collapse them to spaces.
    text = text.replace(/\s+/g, " ").trim();

    if (!text) continue;
    blocks.push({ heading: headingLevelFromStyle(style), isListItem, text });
  }

  return blocks;
}

export function parseMarkdownBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({ heading: level, isListItem: false, text: heading[2].trim() });
      continue;
    }

    const bullet = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      blocks.push({ heading: 0, isListItem: true, text: stripMarkdownInline(bullet[1]) });
      continue;
    }

    blocks.push({ heading: 0, isListItem: false, text: stripMarkdownInline(line) });
  }
  return blocks;
}

function stripMarkdownInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .trim();
}

// ─── Quantity extraction ─────────────────────────────────────────────────────

/**
 * Units we're willing to recognize. Anything outside this list is treated as
 * part of the ingredient name, so "2 Chicken Breasts" yields quantity "2" with
 * a blank unit rather than inventing a unit called "Chicken".
 */
const UNITS = [
  "lb", "lbs", "pound", "pounds",
  "oz", "ounce", "ounces",
  "g", "gram", "grams", "kg",
  "ml", "l", "liter", "liters",
  "cup", "cups",
  "tbsp", "tablespoon", "tablespoons",
  "tsp", "teaspoon", "teaspoons",
  "clove", "cloves",
  "can", "cans", "jar", "jars",
  "package", "packages", "pkg", "packet", "packets", "pack", "packs",
  "bag", "bags", "box", "boxes", "bottle", "bottles",
  "container", "containers", "block", "blocks",
  "bunch", "bunches", "head", "heads", "bulb", "bulbs",
  "loaf", "loaves", "sprig", "sprigs", "ear", "ears",
  "slice", "slices", "stick", "sticks", "strip", "strips", "piece", "pieces",
  "dozen", "pinch", "dash",
  "quart", "quarts", "pint", "pints", "gallon", "gallons",
  "fillet", "fillets", "breast", "breasts",
];

const UNIT_PATTERN = UNITS.join("|");
/**
 * Ordered longest-form-first so mixed numbers win: without this, "1 1/2 cups"
 * would match the bare "1" and leave "1/2 cups" stranded in the ingredient name.
 */
const NUMBER = [
  String.raw`\d+\s+\d+\s*\/\s*\d+`, // 1 1/2
  String.raw`\d+\s*[½¼¾⅓⅔⅛]`, // 1½
  String.raw`\d+\s*\/\s*\d+`, // 1/2
  String.raw`\d+(?:[.,]\d+)?`, // 2, 1.5
  String.raw`[½¼¾⅓⅔⅛]`, // ½
].join("|");

/** `2 lbs Chicken Thighs`, `1 1/2 cups rice`, `3 Salmon Fillets` */
const LEADING = new RegExp(String.raw`^(${NUMBER})\s*(${UNIT_PATTERN})?\b\.?\s*(?:of\s+)?(.+)$`, "i");
/** `Bacon (1 lb)`, `Russet Potatoes (2 large)` — a trailing parenthetical that leads with a number. */
const TRAILING_PAREN = new RegExp(String.raw`^(.*?)\s*\((${NUMBER})\s*(${UNIT_PATTERN})?[^)]*\)\s*$`, "i");

/**
 * Reads an explicit quantity/unit off an ingredient line, or returns blanks.
 *
 * Blank is the correct answer far more often than not: in Ray's current export
 * none of the 352 ingredient lines state a quantity. The extractor exists so
 * documents that *do* state one aren't thrown away, not to guess at the rest.
 */
export function extractIngredient(line: string): ParsedIngredient {
  const text = line.replace(/\s+/g, " ").trim();

  const leading = LEADING.exec(text);
  if (leading && leading[3]?.trim()) {
    return {
      name: leading[3].trim().replace(/^[-–—,]\s*/, ""),
      quantity: normalizeQuantity(leading[1]),
      unit: (leading[2] ?? "").toLowerCase(),
    };
  }

  const paren = TRAILING_PAREN.exec(text);
  if (paren && paren[1]?.trim()) {
    return {
      name: paren[1].trim(),
      quantity: normalizeQuantity(paren[2]),
      unit: (paren[3] ?? "").toLowerCase(),
    };
  }

  return { name: text, quantity: "", unit: "" };
}

function normalizeQuantity(raw: string): string {
  return raw.replace(/\s*\/\s*/, "/").replace(/,/g, ".").trim();
}

// ─── Classification ──────────────────────────────────────────────────────────

const HUMAN_SECTION = /human|people|for us/i;
/** The pet variant is deliberately dropped — only the human recipe is imported. */
const PET_SECTION = /koda|dog|pet|canine/i;
const INGREDIENTS_SECTION = /ingredient/i;
const INSTRUCTIONS_SECTION = /instruction|direction|method|steps|preparation/i;

/**
 * Signals that a document is a multi-day plan / grocery list rather than one
 * recipe. These documents legitimately contain ingredient-shaped bullet lists,
 * so they must be recognized and excluded rather than flattened into one
 * enormous bogus "meal".
 */
const MEAL_PLAN_SIGNALS = /grocery list|meal plan|rotation|directive|week\s*\d|dinner plan|shopping list/i;

function titleFromFileName(fileName: string): string {
  const base = fileName.split("/").pop() ?? fileName;
  return base
    .replace(/\.(docx|md|txt)$/i, "")
    .replace(/\.md$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyBlocks(blocks: Block[], fileName: string): DocOutcome {
  const title = blocks.find((b) => b.heading === 1)?.text.trim() || titleFromFileName(fileName);

  // Description: body paragraphs before the first section heading. "Source:" is
  // provenance metadata (e.g. "Source: HelloFresh"), not part of the recipe.
  const firstSectionIdx = blocks.findIndex((b) => b.heading === 2 || b.heading === 3);
  const preamble = (firstSectionIdx === -1 ? blocks : blocks.slice(0, firstSectionIdx))
    .filter((b) => b.heading === 0 && !b.isListItem && !/^source\s*:/i.test(b.text))
    .map((b) => b.text);
  const description = preamble.join(" ").trim();

  const { ingredientLines, instructionLines } = collectRecipeSections(blocks);

  if (ingredientLines.length === 0) {
    const headingText = blocks.filter((b) => b.heading > 0).map((b) => b.text).join(" ");
    if (MEAL_PLAN_SIGNALS.test(`${title} ${headingText}`)) {
      return {
        kind: "skipped",
        fileName,
        reason: "meal-plan-directive",
        detail: `"${title}" reads as a multi-day meal plan / grocery list, not a single recipe. Its meals weren't imported — add them individually if you want them in the catalog.`,
      };
    }
    return {
      kind: "skipped",
      fileName,
      reason: "no-recipe-structure",
      detail: `"${title}" has no Ingredients section, so there was nothing to import.`,
    };
  }

  const ingredients = ingredientLines.map(extractIngredient).filter((i) => i.name.length > 0);
  if (ingredients.length === 0) {
    return {
      kind: "skipped",
      fileName,
      reason: "no-ingredients",
      detail: `"${title}" has an Ingredients heading but no ingredient lines under it.`,
    };
  }

  return {
    kind: "recipe",
    fileName,
    recipe: { name: title, description, instructions: instructionLines, ingredients },
  };
}

/**
 * Walks the block list tracking the current Heading2 (audience) and Heading3
 * (Ingredients / Instructions) context, collecting only list items that fall
 * under the human audience.
 *
 * Documents that skip the audience split and go straight to `### Ingredients`
 * are handled too: with no Heading2 seen yet, the section counts as human.
 */
function collectRecipeSections(blocks: Block[]): {
  ingredientLines: string[];
  instructionLines: string[];
} {
  const ingredientLines: string[] = [];
  const instructionLines: string[] = [];

  let audience: "human" | "pet" | "other" | null = null;
  let section: "ingredients" | "instructions" | null = null;

  for (const block of blocks) {
    if (block.heading === 1) continue;

    if (block.heading === 2) {
      // Check pet first: "🐕 Koda-Safe Adaptation" must never be read as human.
      if (PET_SECTION.test(block.text)) audience = "pet";
      else if (HUMAN_SECTION.test(block.text)) audience = "human";
      else audience = "other";
      section = null;
      continue;
    }

    if (block.heading === 3) {
      if (INGREDIENTS_SECTION.test(block.text)) section = "ingredients";
      else if (INSTRUCTIONS_SECTION.test(block.text)) section = "instructions";
      else section = null;
      continue;
    }

    if (!block.isListItem || !section) continue;
    if (audience === "pet" || audience === "other") continue;

    if (section === "ingredients") ingredientLines.push(block.text);
    else instructionLines.push(block.text);
  }

  return { ingredientLines, instructionLines };
}

// ─── File dispatch ───────────────────────────────────────────────────────────

const MAC_JUNK = /(^|\/)(__MACOSX\/|\._|\.DS_Store$)/;

/** Expands any uploaded .zip one level into its member files. */
export function expandUploads(files: UploadedFile[]): UploadedFile[] {
  const expanded: UploadedFile[] = [];
  for (const file of files) {
    if (!/\.zip$/i.test(file.fileName)) {
      expanded.push(file);
      continue;
    }
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(file.bytes);
    } catch {
      expanded.push(file); // Surfaces as "unreadable" during parsing.
      continue;
    }
    for (const [name, bytes] of Object.entries(entries)) {
      if (name.endsWith("/") || MAC_JUNK.test(name) || bytes.length === 0) continue;
      expanded.push({ fileName: name, bytes });
    }
  }
  return expanded;
}

export function parseCookbookFile(file: UploadedFile): DocOutcome {
  const { fileName, bytes } = file;

  if (/\.docx$/i.test(fileName)) {
    try {
      return classifyBlocks(parseDocxBlocks(bytes), fileName);
    } catch (err) {
      return {
        kind: "skipped",
        fileName,
        reason: "unreadable",
        detail: `Couldn't read "${fileName}" as a Word document (${err instanceof Error ? err.message : "unknown error"}).`,
      };
    }
  }

  if (/\.(md|markdown|txt)$/i.test(fileName)) {
    try {
      return classifyBlocks(parseMarkdownBlocks(new TextDecoder().decode(bytes)), fileName);
    } catch (err) {
      return {
        kind: "skipped",
        fileName,
        reason: "unreadable",
        detail: `Couldn't read "${fileName}" as text (${err instanceof Error ? err.message : "unknown error"}).`,
      };
    }
  }

  return {
    kind: "skipped",
    fileName,
    reason: "unsupported-file",
    detail: `"${fileName}" isn't a supported format — upload .docx, .md, or .txt (or a .zip of them).`,
  };
}
