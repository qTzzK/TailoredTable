// Card-statement descriptor suffix. "I don't recognize this charge" is the
// most common dispute reason and the cheapest one to prevent outright.
//
// The static prefix is configured in the Stripe Dashboard as "TAILORTSTE"
// (10 chars — the max static prefix is 10, and the complete rendered
// descriptor "PREFIX* SUFFIX" must be <= 22 chars).
// The customer sees: TAILORTSTE* INV1042

const DESCRIPTOR_PREFIX_LEN = 10;
const SUFFIX_MAX = 22 - DESCRIPTOR_PREFIX_LEN - 2; // 10

export function descriptorSuffix(invoiceNumber: number): string {
  return `INV${invoiceNumber}`.replace(/[<>\\'"*]/g, '').slice(0, SUFFIX_MAX);
}
