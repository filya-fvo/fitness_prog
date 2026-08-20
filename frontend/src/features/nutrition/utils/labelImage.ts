const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DIRECT_UPLOAD_LIMIT = 3 * 1024 * 1024;
const HARD_UPLOAD_LIMIT = 8 * 1024 * 1024;
const MAX_DIMENSION = 1800;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось прочитать фото"));
    };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Не удалось подготовить фото"))),
      "image/jpeg",
      0.86,
    );
  });
}

/** Keep camera uploads fast and below the backend's bounded upload size. */
export async function prepareNutritionLabelImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Выбранный файл не является изображением");
  }
  if (ALLOWED_TYPES.has(file.type) && file.size <= DIRECT_UPLOAD_LIMIT) return file;

  const image = await loadImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Не удалось подготовить фото");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await canvasBlob(canvas);
  if (blob.size > HARD_UPLOAD_LIMIT) {
    throw new Error("Фото слишком большое. Сфотографируйте этикетку ближе");
  }
  const baseName = file.name.replace(/\.[^.]+$/, "") || "nutrition-label";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}
