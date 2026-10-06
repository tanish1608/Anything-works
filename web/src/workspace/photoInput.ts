import type { Photo } from "./state";

export async function readPhoto(file: File): Promise<Photo> {
  if (!file.type.startsWith("image/") || file.size > 12 * 1024 * 1024)
    throw new Error("Choose an image smaller than 12 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(
          new Error(
            "This image format could not be opened. Try a JPEG or PNG.",
          ),
        );
      image.src = url;
    });
    const scale = Math.min(
      1,
      1200 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image capture is unavailable.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
      id: crypto.randomUUID(),
      url: canvas.toDataURL("image/jpeg", 0.78),
      sample: false,
      name: file.name,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
