import type { ImgHTMLAttributes } from "react";
import brandImage from "@/assets/staybest-brand-tagline-1789131885718.png";
import pinImage from "@/assets/staybest-pin-transparent.png";

type BrandLogoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  variant?: "full" | "horizontal";
};

export function BrandLogo({
  alt = "StayBest — Choose your own Space",
  className,
  variant = "full",
  ...props
}: BrandLogoProps) {
  if (variant === "horizontal") {
    return (
      <span
        role="img"
        aria-label={alt}
        className={["inline-flex h-12 items-center gap-2.5 leading-none", className].filter(Boolean).join(" ")}
      >
        <img
          src={pinImage}
          alt=""
          aria-hidden="true"
          className="h-full w-auto shrink-0 object-contain"
        />
        <span className="flex min-w-0 flex-col justify-center">
          <span className="font-serif text-[clamp(1.1rem,2vw,1.45rem)] font-semibold tracking-[-0.04em] text-secondary">
            Stay<span className="text-primary">Best</span>
          </span>
          <span className="mt-0.5 whitespace-nowrap font-sans text-[clamp(0.42rem,0.75vw,0.62rem)] font-semibold uppercase tracking-[0.16em] text-secondary/65">
            Choose your own Space
          </span>
        </span>
      </span>
    );
  }

  return (
    <img
      {...props}
      src={brandImage}
      alt={alt}
      className={["object-contain", className].filter(Boolean).join(" ")}
    />
  );
}