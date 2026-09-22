import type { GeometryVariant } from "@/lib/creative/types";

export function SceneGeometry({ variant }: { variant: GeometryVariant }) {
  if (variant === "none") return null;
  return (
    <div className={`ps-geo ps-geo-${variant}`} aria-hidden="true">
      {variant === "orb" ? <span className="ps-geo-orb" /> : null}
      {variant === "grain" ? <span className="ps-geo-grain" /> : null}
      {variant === "line" ? <span className="ps-geo-line" /> : null}
      {variant === "frame" ? <span className="ps-geo-frame" /> : null}
      {variant === "arch" ? <span className="ps-geo-arch" /> : null}
    </div>
  );
}
