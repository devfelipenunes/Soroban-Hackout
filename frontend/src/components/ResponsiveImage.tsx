import { useState, type ImgHTMLAttributes, type ReactElement } from "react";

import { responsiveImage, srcSetOf } from "../levels/index.ts";

type Props = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "srcSet" | "sizes" | "width" | "height"
> & {
  src: string;
  mobileSrc?: string;
  sizes: string;
  alt: string;
  avif?: boolean;
};

export function ResponsiveImage({
  src,
  mobileSrc,
  sizes,
  alt,
  avif = true,
  className,
  decoding = "async",
  onError,
  ...rest
}: Props): ReactElement {
  const image = responsiveImage(src);
  const mobileImage = mobileSrc ? responsiveImage(mobileSrc) : null;
  const [failedSource, setFailedSource] = useState<string | null>(null);

  if (image === null || failedSource === src) {
    return (
      <img
        src={src}
        alt={alt}
        sizes={sizes}
        width={image?.width}
        height={image?.height}
        className={className}
        decoding={decoding}
        onError={onError}
        {...rest}
      />
    );
  }

  return (
    <picture className="responsive-picture">
      {mobileImage !== null && mobileImage.avif.length > 0 && (
        <source
          media="(max-width: 640px)"
          type="image/avif"
          srcSet={srcSetOf(mobileImage.avif)}
          sizes={sizes}
        />
      )}
      {mobileImage !== null && (
        <source
          media="(max-width: 640px)"
          type="image/webp"
          srcSet={srcSetOf(mobileImage.webp)}
          sizes={sizes}
        />
      )}
      {avif && image.avif.length > 0 && (
        <source type="image/avif" srcSet={srcSetOf(image.avif)} sizes={sizes} />
      )}
      <source type="image/webp" srcSet={srcSetOf(image.webp)} sizes={sizes} />
      <img
        src={image.fallback}
        srcSet={srcSetOf(image.webp)}
        sizes={sizes}
        width={image.width}
        height={image.height}
        alt={alt}
        className={className}
        decoding={decoding}
        onError={(event) => {
          onError?.(event);
          setFailedSource(src);
        }}
        {...rest}
      />
    </picture>
  );
}
