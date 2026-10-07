/**
 * Host record domain: product identity reader.
 *
 * Asks the identifier engine to restate fields the landing page already
 * shows. This module does not request a page and does not choose an order.
 */
import { createProductIdentifierEngine, type ProductEngineRead, type ProductIdentifierEngine } from "./product-identifier-engine";

export type ProductParse = ProductEngineRead;

export interface ProductParser {
  readonly engine: ProductIdentifierEngine;
  parse(html: string): ProductParse;
}

export function createProductParser(engine: ProductIdentifierEngine = createProductIdentifierEngine()): ProductParser {
  return {
    engine,
    parse(html) {
      return engine.read(html);
    },
  };
}
