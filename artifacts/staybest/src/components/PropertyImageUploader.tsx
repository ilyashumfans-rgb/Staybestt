import { useId, useState } from "react";
import { ImagePlus, Loader2, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_GIF_BYTES = 8 * 1024 * 1024;
const MAX_GALLERY_IMAGES = 12;

type PropertyImageUploaderProps = {
  mainValue: string;
  galleryValue?: string;
  onMainChange: (value: string) => void;
  onGalleryChange?: (value: string) => void;
  getToken?: () => Promise<string | null>;
  showGallery?: boolean;
  imageLabel?: string;
};

export function PropertyImageUploader({
  mainValue,
  galleryValue = "",
  onMainChange,
  onGalleryChange,
  getToken,
  showGallery = true,
  imageLabel = "Property",
}: PropertyImageUploaderProps) {
  const id = useId();
  const [uploadingMain, setUploadingMain] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const gallery = galleryValue.split(",").map((item) => item.trim()).filter(Boolean);

  const uploadFile = async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      throw new Error("Choose a JPG, PNG, WebP, or GIF image.");
    }
    const limit = file.type === "image/gif" ? MAX_GIF_BYTES : MAX_IMAGE_BYTES;
    if (file.size > limit) {
      throw new Error(
        file.type === "image/gif"
          ? "Animated GIFs must be 8 MB or smaller for fast loading."
          : "Images must be 12 MB or smaller.",
      );
    }

    const clerkToken = await getToken?.();
    const adminToken = localStorage.getItem("staybest-admin-key");
    const token = clerkToken || adminToken;
    const response = await fetch("/api/storage/uploads/request-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    });
    if (!response.ok) throw new Error("Could not start the image upload.");

    const { uploadURL, objectPath } = await response.json();
    const uploaded = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!uploaded.ok) throw new Error("Image upload failed. Please try again.");
    return `/api/storage${objectPath}`;
  };

  const uploadMain = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploadingMain(true);
    try {
      onMainChange(await uploadFile(file));
      toast.success(file.type === "image/gif" ? "Animated GIF uploaded" : "Main image uploaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploadingMain(false);
    }
  };

  const uploadGallery = async (files: FileList | null) => {
    if (!files?.length || !onGalleryChange) return;
    const availableSlots = MAX_GALLERY_IMAGES - gallery.length;
    if (availableSlots <= 0) {
      toast.error(`A property can have up to ${MAX_GALLERY_IMAGES} gallery images.`);
      return;
    }
    const selected = Array.from(files).slice(0, availableSlots);
    setUploadingGallery(true);
    try {
      const uploaded: string[] = [];
      for (const file of selected) uploaded.push(await uploadFile(file));
      onGalleryChange([...gallery, ...uploaded].join(", "));
      toast.success(`${uploaded.length} gallery image${uploaded.length === 1 ? "" : "s"} uploaded`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploadingGallery(false);
    }
  };

  return (
    <div className="col-span-2 grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <label className="text-xs font-bold text-secondary block">Main {imageLabel} Image *</label>
        <label
          htmlFor={`${id}-main`}
          className="flex min-h-28 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4 text-center transition-colors hover:bg-primary/10"
        >
          <input
            id={`${id}-main`}
            hidden
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
            onChange={(event) => void uploadMain(event.target.files)}
          />
          {uploadingMain ? (
            <span className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Loader2 className="h-5 w-5 animate-spin" /> Uploading…
            </span>
          ) : (
            <span className="flex flex-col items-center gap-2 text-sm font-semibold text-secondary">
              <UploadCloud className="h-6 w-6 text-primary" />
              Upload main image or animated GIF
            </span>
          )}
        </label>
        <Input
          required
          value={mainValue}
          onChange={(event) => onMainChange(event.target.value)}
          placeholder="Or paste an image URL"
          aria-label={`Main ${imageLabel.toLowerCase()} image URL`}
        />
        {mainValue && (
          <div className="relative overflow-hidden rounded-xl border bg-muted">
            <img src={mainValue} alt="Main property preview" className="h-36 w-full object-cover" decoding="async" />
            <Button type="button" variant="destructive" size="icon" className="absolute right-2 top-2 h-8 w-8" onClick={() => onMainChange("")}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {showGallery && onGalleryChange && (
        <div className="space-y-2">
          <label className="text-xs font-bold text-secondary block">Gallery Images</label>
          <label
            htmlFor={`${id}-gallery`}
            className="flex min-h-28 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4 text-center transition-colors hover:bg-primary/10"
          >
            <input
              id={`${id}-gallery`}
              hidden
              multiple
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
              onChange={(event) => void uploadGallery(event.target.files)}
            />
            {uploadingGallery ? (
              <span className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Loader2 className="h-5 w-5 animate-spin" /> Uploading gallery…
              </span>
            ) : (
              <span className="flex flex-col items-center gap-2 text-sm font-semibold text-secondary">
                <ImagePlus className="h-6 w-6 text-primary" />
                Select multiple gallery images
              </span>
            )}
          </label>
          <p className="text-xs text-muted-foreground">
            JPG, PNG, WebP or GIF. Up to {MAX_GALLERY_IMAGES} images. For best speed, use WebP or GIFs under 8 MB.
          </p>
          {gallery.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {gallery.map((image, index) => (
                <div key={`${image}-${index}`} className="group relative overflow-hidden rounded-lg border bg-muted">
                  <img src={image} alt={`Gallery preview ${index + 1}`} className="h-20 w-full object-cover" loading="lazy" decoding="async" />
                  <button
                    type="button"
                    className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"
                    onClick={() => onGalleryChange(gallery.filter((_, itemIndex) => itemIndex !== index).join(", "))}
                    aria-label={`Remove gallery image ${index + 1}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}