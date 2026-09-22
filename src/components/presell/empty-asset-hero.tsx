export function EmptyAssetHero({
  productName,
}: {
  productName?: string;
}) {
  const mark = (productName || "").trim();
  return (
    <div className="ps-empty-asset ps-empty-asset-compact" data-placeholder="true" data-empty-asset="1">
      <span className="ps-empty-geo ps-empty-geo-a" aria-hidden="true" />
      <span className="ps-empty-geo ps-empty-geo-b" aria-hidden="true" />
      <span className="ps-empty-geo ps-empty-geo-c" aria-hidden="true" />
      <div className="ps-empty-frame">
        <p className="ps-empty-kicker">Product</p>
        {mark ? <p className="ps-empty-mark">{mark}</p> : null}
      </div>
      <p className="sr-only">Product image not available</p>
    </div>
  );
}
