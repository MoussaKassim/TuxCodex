const previewExtension = /\.(?:png|jpe?g|webp|svg|pdf|html?|txt|md|json|csv|log)$/i;
const imageExtension = /\.(?:png|jpe?g|webp|svg)$/i;

export function localPath(value: string): string | null {
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !value.startsWith("file://") && !/^[A-Za-z]:[\\/]/.test(value)) return null;
  let path = value;
  if (value.startsWith("file://")) {
    try { path = decodeURIComponent(value.slice(7)); }
    catch { return null; }
    if (/^\/[A-Za-z]:[\\/]/.test(path)) path = path.slice(1);
  }
  return previewExtension.test(path) ? path : null;
}

export function isImagePath(value: string): boolean {
  return imageExtension.test(value);
}

export function referencedImagePaths(markdown: string): string[] {
  const withoutEmbeddedImages = markdown.replace(/!\[[^\]]*\]\((?:<[^>]*>|[^)]*)\)/g, " ");
  const pattern = /(?:file:\/\/)?(?:[A-Za-z]:[\\/]|\.{1,2}[\\/]|[\\/])?[^\s<>()"'`]+?\.(?:png|jpe?g|webp|svg)(?=$|[\s<>()"'`,.!?;:\]])/gi;
  const paths = new Set<string>();
  for (const match of withoutEmbeddedImages.matchAll(pattern)) {
    const path = localPath(match[0]);
    if (path && isImagePath(path)) paths.add(path);
  }
  return [...paths];
}
