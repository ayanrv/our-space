import { supabase } from "./supabase";
import { readDemo, writeDemo } from "./demo";
// Normalize, center-crop and strip source metadata before uploading.
async function preparePicture(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPG, PNG or WebP image.");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Choose an image smaller than 5 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error("This image could not be opened.");
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser could not prepare the image.");
    const size = Math.min(image.naturalWidth, image.naturalHeight);
    ctx.drawImage(
      image,
      (image.naturalWidth - size) / 2,
      (image.naturalHeight - size) / 2,
      size,
      size,
      0,
      0,
      512,
      512,
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.88),
    );
    if (!blob || blob.size > 2097152)
      throw new Error("Could not save this image. Try a smaller one.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function updatePicture(
  demo: boolean,
  userId: string,
  file: File | null,
  oldPath?: string | null,
) {
  const blob = file ? await preparePicture(file) : null;
  if (demo) {
    const d = readDemo();
    const p = d.profiles.find((p) => p.id === userId);
    if (!p) throw new Error("Profile unavailable.");
    p.avatar_url = blob
      ? await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })
      : undefined;
    writeDemo(d);
    return;
  }
  if (!supabase) throw new Error("Sign in to update your picture.");
  const path = blob
    ? `${userId}/${crypto.randomUUID()}.${blob.type === "image/png" ? "png" : "webp"}`
    : null;
  if (blob && path) {
    const uploaded = await supabase.storage
      .from("profile-pictures")
      .upload(path, blob, { contentType: blob.type, upsert: false });
    if (uploaded.error) throw uploaded.error;
  }
  const saved = await supabase
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", userId)
    .select("id")
    .single();
  if (saved.error) {
    if (path) await supabase.storage.from("profile-pictures").remove([path]);
    throw saved.error;
  }
  if (oldPath)
    await supabase.storage.from("profile-pictures").remove([oldPath]);
}
