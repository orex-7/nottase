import { createClient } from "@/lib/supabase/client";

/**
 * Bucket do Supabase Storage onde as imagens das páginas são guardadas.
 * Precisa existir (ver `supabase/migrations/*_init_storage_images.sql`).
 */
export const PAGE_IMAGES_BUCKET = "page-images";

/** Tamanho máximo aceito por arquivo (5 MB). */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/** Tipos MIME de imagem aceitos no upload. */
export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
] as const;

/** Resultado do upload: URL pública + caminho do objeto no bucket. */
export interface UploadedImage {
  /** URL pública para usar no `src` da imagem. */
  url: string;
  /** Caminho do objeto dentro do bucket (útil para remover depois). */
  path: string;
}

/** Erro amigável quando o arquivo não passa na validação local. */
export class ImageValidationError extends Error {}

/** Extensão de arquivo inferida do tipo MIME (fallback: `bin`). */
function extensionFor(file: File): string {
  const fromName = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase()
    : "";
  if (fromName) return fromName;
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
  };
  return map[file.type] ?? "bin";
}

/**
 * Valida o arquivo antes de subir. Lança {@link ImageValidationError} com uma
 * mensagem em português pronta para exibir ao usuário.
 */
export function validateImageFile(file: File): void {
  if (!file.type.startsWith("image/")) {
    throw new ImageValidationError("Selecione um arquivo de imagem válido.");
  }
  if (
    !ACCEPTED_IMAGE_TYPES.includes(
      file.type as (typeof ACCEPTED_IMAGE_TYPES)[number],
    )
  ) {
    throw new ImageValidationError(
      "Formato não suportado. Use PNG, JPG, WEBP, GIF ou SVG.",
    );
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new ImageValidationError("A imagem deve ter no máximo 5 MB.");
  }
}

/**
 * Faz upload de uma imagem de página no Supabase Storage e devolve a URL
 * pública. O arquivo é guardado em `<user_id>/<uuid>.<ext>`, o que permite
 * políticas de RLS por pasta (cada usuário só mexe nos próprios objetos).
 */
export async function uploadPageImage(file: File): Promise<UploadedImage> {
  validateImageFile(file);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Você precisa estar autenticado para enviar imagens.");

  const ext = extensionFor(file);
  const objectId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${user.id}/${objectId}.${ext}`;

  const { error } = await supabase.storage
    .from(PAGE_IMAGES_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
  if (error) throw error;

  const { data } = supabase.storage.from(PAGE_IMAGES_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * Remove uma imagem do Storage a partir do caminho do objeto (best-effort).
 * Falhas são ignoradas para não bloquear a edição da página.
 */
export async function removePageImage(path: string): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.storage.from(PAGE_IMAGES_BUCKET).remove([path]);
  } catch {
    /* ignora — remoção é oportunista */
  }
}
