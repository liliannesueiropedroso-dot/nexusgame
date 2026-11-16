/**
 * Genera una miniatura DataURL PNG compacta desde un Blob de imagen
 * y devuelve además las dimensiones naturales de la imagen.
 */
export async function generateThumbnailFromBlob(
  blob: Blob,
  maxSize = 160
): Promise<{ thumbnailDataUrl: string; width: number; height: number }> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await loadHtmlImage(objectUrl);
    const width = img.naturalWidth || img.width || 128;
    const height = img.naturalHeight || img.height || 128;

    const scale = Math.min(1, maxSize / Math.max(width, height, 1));
    const thumbW = Math.max(1, Math.round(width * scale));
    const thumbH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = thumbW;
    canvas.height = thumbH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('No se pudo inicializar el contexto 2D para generar la miniatura.');
    }

    ctx.clearRect(0, 0, thumbW, thumbH);
    ctx.drawImage(img, 0, 0, thumbW, thumbH);

    const thumbnailDataUrl = canvas.toDataURL('image/png');
    return { thumbnailDataUrl, width, height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error('El archivo de imagen está dañado o tiene un formato no legible.'));
    img.src = src;
  });
}
