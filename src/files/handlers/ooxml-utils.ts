import { XMLParser } from "fast-xml-parser";

export const OOXML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
});

export function asArray<T>(value: T | readonly T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? [...value] : [value as T];
}

export function collectLocalNameText(value: unknown, localName: string, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectLocalNameText(item, localName, out);
    return out;
  }
  if (typeof value !== "object" || value === null) return out;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key.split(":").at(-1) === localName) {
      if (typeof child === "string" || typeof child === "number") out.push(String(child));
      else collectPrimitiveStrings(child, out);
    } else {
      collectLocalNameText(child, localName, out);
    }
  }
  return out;
}

export function collectPrimitiveStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string" || typeof value === "number") {
    out.push(String(value));
  } else if (Array.isArray(value)) {
    for (const item of value) collectPrimitiveStrings(item, out);
  } else if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value as Record<string, unknown>)) collectPrimitiveStrings(child, out);
  }
  return out;
}

export function naturalNumber(path: string): number {
  const match = path.match(/(\d+)(?!.*\d)/u);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}
