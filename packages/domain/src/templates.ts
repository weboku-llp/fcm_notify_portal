/**
 * Very small, safe {{variable}} substitution. Unknown variables are replaced
 * with an empty string. Whitespace inside the braces is tolerated: {{ name }}.
 */
const VAR_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export function renderString(input: string, vars: Record<string, string>): string {
  return input.replace(VAR_RE, (_m, key: string) => vars[key] ?? "");
}

export interface RenderableContent {
  title: string;
  body: string;
  imageUrl?: string | null;
  deepLink?: string | null;
  dataJson?: Record<string, string>;
}

export function renderContent<T extends RenderableContent>(content: T, vars: Record<string, string>): T {
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(content.dataJson ?? {})) {
    data[k] = renderString(v, vars);
  }
  return {
    ...content,
    title: renderString(content.title, vars),
    body: renderString(content.body, vars),
    imageUrl: content.imageUrl ? renderString(content.imageUrl, vars) : content.imageUrl,
    deepLink: content.deepLink ? renderString(content.deepLink, vars) : content.deepLink,
    dataJson: data,
  };
}

/** Extract {{variables}} referenced in any string field. */
export function extractVariables(...strings: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const s of strings) {
    if (!s) continue;
    for (const m of s.matchAll(VAR_RE)) found.add(m[1]!);
  }
  return [...found];
}
