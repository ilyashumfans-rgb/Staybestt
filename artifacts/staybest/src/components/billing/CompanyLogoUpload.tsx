import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CompanyLogoUpload({ value, onChange, onBusy }: {
  value: string; onChange: (value: string) => void; onBusy: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload(file: File) {
    setError("");
    setBusy(true);
    onBusy(true);
    let image: ImageBitmap | undefined;
    try {
      if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 5 * 1024 * 1024) {
        throw new Error("Choose a PNG or JPG logo, up to 5 MB.");
      }
      image = await createImageBitmap(file);
      const scale = Math.min(1, 512 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser could not process the logo.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        result => result ? resolve(result) : reject(new Error("Could not process image.")), "image/png",
      ));
      const response = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("staybest-admin-key") || ""}` },
        body: JSON.stringify({ name: "company-logo.png", size: blob.size, contentType: "image/png" }),
      });
      if (!response.ok) throw new Error("Could not start upload. Check your admin session.");
      const { uploadURL, objectPath } = await response.json();
      const uploaded = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": "image/png" }, body: blob });
      if (!uploaded.ok) throw new Error("Logo upload failed. Please try again.");
      onChange(`/api/storage${objectPath}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Logo upload failed.");
    } finally {
      image?.close();
      setBusy(false);
      onBusy(false);
    }
  }
  return <div className="space-y-3">
    <label htmlFor="company-logo" className="text-sm font-medium">Company logo</label>
    {value && <div className="flex items-center gap-4">
      <img src={value} alt="Company logo preview" className="h-20 w-44 rounded border bg-white object-contain p-2" />
      <Button type="button" variant="outline" disabled={busy} onClick={() => onChange("")}>Remove logo</Button>
    </div>}
    <input id="company-logo" type="file" accept="image/png,image/jpeg" disabled={busy} className="block w-full text-sm" onChange={event => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (file) void upload(file);
    }} />
    <p className="text-xs text-muted-foreground">{busy ? "Uploading logo…" : "PNG or JPG, up to 5 MB. Save the profile to apply your logo. Without a custom logo, invoices use the StayBest logo."}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
