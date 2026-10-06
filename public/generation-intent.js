export function generationKind(prompt, mode = "auto") {
  if (mode === "image" || mode === "video") return mode;
  if (mode === "chat") return null;
  const match =
    /^(?:please\s+)?(?:create|generate|make|draw|render)\s+(?:(?:me|an?|the)\s+)*(?:[\w-]+\s+){0,3}(image|picture|illustration|photo|video|clip)\b/i.exec(
      prompt.trim(),
    );
  return match ? (/video|clip/i.test(match[1]) ? "video" : "image") : null;
}
