export function SectionNav({
  productLabel,
  links,
  cta,
}: {
  productLabel: string;
  links: ReadonlyArray<{ id: string; label: string }>;
  cta: React.ReactNode;
}) {
  return (
    <nav className="ps-section-nav" aria-label="Page">
      <a className="ps-section-nav-product" href="#hero">
        {productLabel}
      </a>
      {links.length > 0 ? (
        <div className="ps-section-nav-links">
          {links.map((link) => (
            <a key={link.id} href={`#${link.id}`}>
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
      <div className="ps-section-nav-cta">{cta}</div>
    </nav>
  );
}
