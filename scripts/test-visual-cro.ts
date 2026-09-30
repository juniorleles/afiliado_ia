// npx tsx scripts/test-visual-cro.ts
import { authorizedOffers, primaryConversionLabel } from "../src/lib/presell-presentation.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const offers = authorizedOffers("FIELD $12 per tin; CAMP $9 per tin; BASE $15 per tin");
assert(offers.length === 3, "a semicolon pricing fact becomes one row per package");
assert(offers[0]?.name === "FIELD" && offers[0]?.price === "$12 per tin", "the name and the authorized price phrase stay intact");
assert(offers[1]?.name === "CAMP" && offers[2]?.name === "BASE", "source order is preserved");
assert(!offers.some((offer) => /save|best|popular|free shipping|was \$/i.test(`${offer.name} ${offer.price}`)), "rows do not add savings or rankings");
assert(authorizedOffers("Ask the seller").length === 0, "a pricing string without a price renders no offer row");
assert(authorizedOffers("").length === 0, "empty pricing renders no offer row");
assert(authorizedOffers("Trail Kit $40").length === 1, "a single authorized price still renders");
assert(
  authorizedOffers("FIELD $12 per tin; includes a bonus guide").length === 0,
  "a segment without its own price does not become a partial offer",
);

assert(primaryConversionLabel("Learn More", true) === "Check Current Offer", "a generic hop with pricing points at the current offer");
assert(primaryConversionLabel("Learn More", false) === "View Official Offer", "a generic hop without pricing does not imply a price");
assert(primaryConversionLabel("View Product Details", true) === "Check Current Offer", "other generic hop labels are replaced the same way");
assert(primaryConversionLabel("Read the label", true) === "Read the label", "a specific stored label is not rewritten");
assert(!/buy now|checkout|%\s*off|save/i.test(primaryConversionLabel("Learn More", true)), "the hop label does not claim checkout or a discount");
