import type { EnrichmentSource } from "@/lib/product-enrichment/types";

const AT = "2026-10-20T00:00:00.000Z";

/**
 * Offline source fixtures for the six lab scenarios.
 * Indexed by position (s1…s6). The engine never branches on a product name.
 */
const SOURCES: EnrichmentSource[][] = [
  [
    {
      url: "https://shop.aldermoor.example/greens",
      retrievedAt: AT,
      pageCategory: "PRODUCT_DETAILS",
      html: `<!doctype html><html><body>
        <h1>Daily greens blend</h1>
        <h2>Specifications</h2>
        <ul><li>Net contents 90 g</li></ul>
        <h2>FAQ</h2>
        <h3>How many capsules are in a bottle?</h3>
        <p>Each bottle contains 60 vegetable capsules.</p>
      </body></html>`,
      records: [
        { field: "specification", name: "Net contents", value: "90", unit: "g" },
        { field: "specification", name: "Capsules per bottle", value: "90" },
        { field: "faq", question: "How should the bottle be stored?", text: "Keep the bottle closed and dry." },
      ],
    },
  ],
  [
    {
      url: "https://pellucid.example/balm",
      retrievedAt: AT,
      pageCategory: "PRIMARY",
      html: `<!doctype html><html><body>
        <h1>Tinted lip balm</h1>
        <h2>Features</h2>
        <ul>
          <li>Tint stays on after a drink of water</li>
          <li>Erases wrinkles in 7 days.</li>
        </ul>
        <h2>Pricing</h2>
        <ul><li>1 tube $18; 3 tubes $45 total</li></ul>
        <h2>Guarantee</h2>
        <p>30-day money-back guarantee on unused tubes.</p>
      </body></html>`,
      records: [
        { field: "feature", text: "Tint stays on after a drink of water" },
        { field: "feature", text: "Erases wrinkles in 7 days." },
        { field: "pricing", text: "1 tube $18; 3 tubes $45 total" },
        { field: "offer", packageName: "1 tube", totalPrice: "$18", unitPrice: "$18", quantity: "1 tube" },
        { field: "offer", packageName: "3 tubes", totalPrice: "$45", unitPrice: "$15", quantity: "3 tubes" },
        { field: "guarantee", text: "30-day money-back guarantee on unused tubes." },
        { field: "faq", question: "Is the formula fragrance-free?", text: "Yes, the formula is fragrance-free." },
      ],
    },
    {
      url: "https://pellucid.example/returns",
      retrievedAt: AT,
      pageCategory: "RETURNS",
      html: `<!doctype html><html><body><p>Unopened tubes may be returned within 30 days of delivery.</p></body></html>`,
      records: [{ field: "returns", kind: "RETURN_WINDOW", text: "Unopened tubes may be returned within 30 days of delivery." }],
    },
  ],
  [
    {
      url: "https://quillon.example/x2",
      retrievedAt: AT,
      pageCategory: "PRODUCT_DETAILS",
      html: `<!doctype html><html><body>
        <h1>True wireless earbuds</h1>
        <h2>How to use</h2>
        <ul><li>Charge the case with the included USB-C cable.</li></ul>
        <h2>FAQ</h2>
        <h3>What is in the box?</h3>
        <p>Earbuds, a charging case, a USB-C cable, and three ear tip sizes.</p>
      </body></html>`,
      records: [
        { field: "usage", text: "Charge the case with the included USB-C cable." },
        { field: "faq", question: "What is in the box?", text: "Earbuds, a charging case, a USB-C cable, and three ear tip sizes." },
      ],
    },
  ],
  [
    {
      url: "https://harlow.example/strap",
      retrievedAt: AT,
      pageCategory: "PRIMARY",
      html: `<!doctype html><html><body>
        <h1>Crossbody phone strap</h1>
        <h2>Features</h2>
        <ul>
          <li>Adjustable from 80 to 150 cm</li>
          <li>Clip attaches to most phone cases</li>
        </ul>
        <h2>Materials</h2>
        <ul><li>Woven nylon</li></ul>
        <h2>How to use</h2>
        <ul><li>Clip the ends to the case loops.</li></ul>
      </body></html>`,
      records: [
        { field: "feature", text: "Adjustable from 80 to 150 cm" },
        { field: "feature", text: "Clip attaches to most phone cases" },
        { field: "component", text: "Woven nylon" },
        { field: "usage", text: "Clip the ends to the case loops." },
      ],
    },
  ],
  [
    {
      url: "https://tessel.example/mugs",
      retrievedAt: AT,
      pageCategory: "PRIMARY",
      html: `<!doctype html><html><body>
        <h1>Stoneware mugs</h1>
        <img src="https://tessel.example/img/mug.jpg" alt="Mug on a table">
        <h2>Guarantee</h2>
        <p>Replacements for manufacturing cracks within 90 days.</p>
        <h2>FAQ</h2>
        <h3>Are the mugs dishwasher safe?</h3>
        <p>Yes, the source states they are dishwasher safe.</p>
      </body></html>`,
      records: [
        { field: "guarantee", text: "Replacements for manufacturing cracks within 90 days." },
        { field: "faq", question: "Are the mugs dishwasher safe?", text: "Yes, the source states they are dishwasher safe." },
      ],
    },
    {
      url: "https://tessel.example/shipping",
      retrievedAt: AT,
      pageCategory: "SHIPPING",
      html: `<!doctype html><html><body><p>Orders ship in a padded box within three business days.</p></body></html>`,
      records: [{ field: "shipping", kind: "PROCESSING", text: "Orders ship in a padded box within three business days." }],
    },
  ],
  [
    {
      url: "https://brindle.example/pillow",
      retrievedAt: AT,
      pageCategory: "PRIMARY",
      html: `<!doctype html><html><body>
        <h1>Travel pillow</h1>
        <h2>Pricing</h2>
        <ul><li>1 pillow $29</li></ul>
        <h2>How to use</h2>
        <ul><li>Place around the neck during travel.</li></ul>
      </body></html>`,
      records: [
        { field: "pricing", text: "1 pillow $29" },
        { field: "offer", packageName: "1 pillow", totalPrice: "$29", unitPrice: "$29", quantity: "1 pillow" },
        { field: "usage", text: "Place around the neck during travel." },
      ],
    },
  ],
];

export function labSources(key: string): EnrichmentSource[] {
  const match = /^s([1-6])$/.exec(key);
  if (!match) return [];
  return SOURCES[Number(match[1]) - 1] ?? [];
}
