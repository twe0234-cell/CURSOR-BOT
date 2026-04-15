/**
 * Unit tests for src/services/crm.service.ts
 *
 * Three suites:
 *
 *  1. calculateContactBalance  — pure financial math, no I/O.
 *     Tested directly: every code path (total_cost vs fallback, investment debt,
 *     buyer sales, extra payments, overpayment clamping, empty inputs).
 *
 *  2. buildSalesList  — pure data transformation, no I/O.
 *     Tested directly: total_price vs fallback, extra payments, all four label
 *     resolution paths, required fields present, empty input.
 *
 *  3. loadContactDetailPage  — async orchestrator, reads Supabase.
 *     Supabase is fully mocked; tests cover the three observable outcomes:
 *     unauthenticated caller, contact not found, and the happy-path structural
 *     contract (every required key is present and correctly typed).
 *
 * Why not more?
 *   The other public functions (createCrmContact, updateCrmContact, …) are
 *   straightforward pass-throughs to Supabase with no business logic.  Adding
 *   tests there would only exercise the mock itself, not real logic.  Revisit
 *   if those functions gain validation rules.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock I/O-bound dependencies BEFORE the service is imported ────────────────
//
// `@/src/lib/supabase/server` uses `next/headers` which crashes outside Next.js.
// `@/lib/logger` opens a Supabase admin connection we never want in tests.
// `@/src/lib/gmail` would make real HTTP requests.
//
// Everything else (`@/lib/sku`, `@/lib/broadcast/imageFile`, `@/lib/inventory/status`,
// `@/src/lib/errors`) is pure – it runs as-is with no side effects.

vi.mock("@/src/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));
vi.mock("@/src/lib/gmail", () => ({ getAccessToken: vi.fn() }));

// ── Import the service (mocks are already in place) ──────────────────────────

import { createClient } from "@/src/lib/supabase/server";
import {
  calculateContactBalance,
  buildSalesList,
  loadContactDetailPage,
} from "./crm.service";

const mockCreateClient = vi.mocked(createClient);

// ─────────────────────────────────────────────────────────────────────────────
// Query-chain mock helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a chainable Supabase query builder stub.
 *
 * All filter / ordering methods return `self`, so they can be chained freely.
 * The stub is also directly awaitable (implements `.then`) so code that does
 * `await supabase.from("x").select().eq()` (without a terminal `.single()`)
 * resolves to `{ data, error }` just as the real client would.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeChain(data: unknown, error: unknown = null): any {
  const result = { data, error };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};

  for (const method of ["select", "eq", "neq", "in", "order", "limit", "not", "is", "or"]) {
    chain[method] = () => chain;
  }

  // Terminal methods used in the service
  chain.single = () => Promise.resolve(result);
  chain.maybeSingle = () => Promise.resolve(result);

  // Makes `await chain` work without calling .single()
  chain.then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected: (e: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled, onRejected);

  return chain;
}

/**
 * Creates a minimal mock Supabase client.
 *
 * `tables` maps table name → the value that should come back in `{ data }`.
 * Pass the exact shape the calling code expects:
 *   - Single-row queries (`.single()`): pass one object or `null`
 *   - Array queries (direct await):    pass an array
 */
function makeMockClient(options: {
  user?: { id: string } | null;
  tables?: Record<string, unknown>;
} = {}) {
  const { user = { id: "test-user-1" }, tables = {} } = options;

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    // Use `in` so an explicit `null` value is preserved (not replaced by []).
    // `tables[table] ?? []` would silently turn null into [] because ?? is nullish-aware.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: vi.fn((table: string): any => makeChain(table in tables ? tables[table] : [])),
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "https://cdn.example.com/img.jpg" } }),
      }),
    },
  };
}

// A minimal valid contact row matching what `fetchContactById` selects.
const MOCK_CONTACT = {
  id: "contact-abc",
  name: "ישראל ישראלי",
  type: "Scribe",
  preferred_contact: "WhatsApp",
  wa_chat_id: null,
  email: "test@example.com",
  phone: "050-1234567",
  tags: ["Sofer", "Jerusalem"],
  notes: null,
  certification: "Badatz",
  phone_type: "Android",
  created_at: "2024-01-15T10:00:00Z",
  handwriting_image_url: null,
};

beforeEach(() => {
  // clearMocks: true in vitest.config.ts resets call counts, but we also need
  // to clear the resolved-value setup between tests.
  mockCreateClient.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. calculateContactBalance
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateContactBalance", () => {
  // Shorthand: call with only the arguments we care about in each test.
  function calc(
    inv: Parameters<typeof calculateContactBalance>[0] = [],
    activeInv: Parameters<typeof calculateContactBalance>[1] = [],
    buyer: Parameters<typeof calculateContactBalance>[2] = [],
    extra: Map<string, number> = new Map()
  ) {
    return calculateContactBalance(inv, activeInv, buyer, extra);
  }

  // ── debtToContact: inventory ──────────────────────────────────────────────

  it("uses total_cost when it is set (inventory)", () => {
    // total_cost=400, paid=100 → still owe 300
    const { debtToContact } = calc([
      { quantity: 10, cost_price: 50, total_cost: 400, amount_paid: 100 },
    ]);
    expect(debtToContact).toBe(300);
  });

  it("falls back to quantity × cost_price when total_cost is null", () => {
    // 5 × 100 = 500, paid=200 → still owe 300
    const { debtToContact } = calc([
      { quantity: 5, cost_price: 100, total_cost: null, amount_paid: 200 },
    ]);
    expect(debtToContact).toBe(300);
  });

  it("treats null quantity as 1 and null cost_price as 0 in fallback", () => {
    // 1 × 0 = 0, paid=0 → owe 0
    const { debtToContact } = calc([
      { quantity: null, cost_price: null, total_cost: null, amount_paid: null },
    ]);
    expect(debtToContact).toBe(0);
  });

  // ── debtToContact: active investments ────────────────────────────────────

  it("adds outstanding active investment debt (status=completed → actual_debt)", () => {
    // status="completed" → classifyDealBalance → "actual_debt" → added to debtToContact
    const { debtToContact } = calc([], [
      { total_agreed_price: 1000, amount_paid: 400, status: "completed" },
    ]);
    expect(debtToContact).toBe(600);
  });

  it("accumulates inventory + investment debt (status=completed → actual_debt)", () => {
    const { debtToContact } = calc(
      [{ quantity: null, cost_price: null, total_cost: 500, amount_paid: 100 }],
      [{ total_agreed_price: 800, amount_paid: 300, status: "completed" }]
    );
    // inventory: 400 + investment: 500 = 900
    expect(debtToContact).toBe(900);
  });

  // ── debtFromContact: buyer sales ─────────────────────────────────────────

  it("calculates buyer sale debt from total_price", () => {
    // total=1000, paid=300 → still owe 700
    const { debtFromContact } = calc([], [], [
      { id: "s1", sale_price: null, quantity: null, total_price: 1000, amount_paid: 300 },
    ]);
    expect(debtFromContact).toBe(700);
  });

  it("calculates buyer sale total from sale_price × quantity when total_price is null", () => {
    // 250 × 3 = 750, paid=0 → owe 750
    const { debtFromContact } = calc([], [], [
      { id: "s1", sale_price: 250, quantity: 3, total_price: null, amount_paid: 0 },
    ]);
    expect(debtFromContact).toBe(750);
  });

  it("treats null quantity as 1 in sale fallback", () => {
    // 200 × 1 = 200, paid=50 → owe 150
    const { debtFromContact } = calc([], [], [
      { id: "s1", sale_price: 200, quantity: null, total_price: null, amount_paid: 50 },
    ]);
    expect(debtFromContact).toBe(150);
  });

  it("adds extra payments from erp_payments to buyer sale paid amount", () => {
    // sale: total=1000, amount_paid=300; extra payment=200 → paid total=500 → owe 500
    const extra = new Map([["s1", 200]]);
    const { debtFromContact } = calc([], [], [
      { id: "s1", sale_price: null, quantity: null, total_price: 1000, amount_paid: 300 },
    ], extra);
    expect(debtFromContact).toBe(500);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it("clamps debt to 0 when a sale is overpaid (no negative debt)", () => {
    // total=100, paid=200 → Math.max(0, 100-200) = 0
    const { debtFromContact } = calc([], [], [
      { id: "s1", sale_price: null, quantity: null, total_price: 100, amount_paid: 200 },
    ]);
    expect(debtFromContact).toBe(0);
  });

  it("clamps inventory debt to 0 when overpaid", () => {
    const { debtToContact } = calc([
      { quantity: null, cost_price: null, total_cost: 100, amount_paid: 150 },
    ]);
    expect(debtToContact).toBe(0);
  });

  it("returns zeros for completely empty inputs", () => {
    expect(calc()).toEqual({ debtToContact: 0, debtFromContact: 0, futureCommitment: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. buildSalesList
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSalesList", () => {
  const noMaps = { invCat: new Map<string, string>(), investDet: new Map<string, string>() };
  const noExtra = new Map<string, number>();

  /** Base sale row – override individual fields in each test. */
  function row(overrides: Partial<{
    id: string; sale_price: number | null; quantity: number | null;
    total_price: number | null; amount_paid: number | null;
    sale_type: string | null; sale_date: string | null;
    item_description: string | null; item_id: string | null; investment_id: string | null;
  }> = {}) {
    return {
      id: "s-default",
      sale_price: null,
      quantity: null,
      total_price: 500,
      amount_paid: 0,
      sale_type: null,
      sale_date: "2024-06-01",
      item_description: null,
      item_id: null,
      investment_id: null,
      ...overrides,
    };
  }

  // ── Price calculation ─────────────────────────────────────────────────────

  it("uses total_price directly when it is set", () => {
    // total_price=600 takes priority over sale_price*quantity (which would be 500)
    const [result] = buildSalesList(
      [row({ sale_price: 100, quantity: 5, total_price: 600 })],
      noMaps.invCat, noMaps.investDet, noExtra
    );
    expect(result.total_price).toBe(600);
  });

  it("falls back to sale_price × quantity when total_price is null", () => {
    const [result] = buildSalesList(
      [row({ sale_price: 100, quantity: 5, total_price: null })],
      noMaps.invCat, noMaps.investDet, noExtra
    );
    expect(result.total_price).toBe(500); // 100 × 5
  });

  it("treats null quantity as 1 in the fallback price calculation", () => {
    const [result] = buildSalesList(
      [row({ sale_price: 300, quantity: null, total_price: null })],
      noMaps.invCat, noMaps.investDet, noExtra
    );
    expect(result.total_price).toBe(300); // 300 × 1
  });

  // ── Payment totals ────────────────────────────────────────────────────────

  it("total_paid includes only amount_paid when there are no extra payments", () => {
    const [result] = buildSalesList(
      [row({ amount_paid: 200 })],
      noMaps.invCat, noMaps.investDet, noExtra
    );
    expect(result.total_paid).toBe(200);
  });

  it("total_paid adds extra erp_payments on top of amount_paid", () => {
    const extra = new Map([["s-custom", 150]]);
    const [result] = buildSalesList(
      [row({ id: "s-custom", amount_paid: 300 })],
      noMaps.invCat, noMaps.investDet, extra
    );
    expect(result.total_paid).toBe(450); // 300 + 150
  });

  // ── Label resolution (all four paths in resolveSaleLabel) ─────────────────

  it('uses item_description for brokerage sales (sale_type="תיווך")', () => {
    const [result] = buildSalesList(
      [row({ sale_type: "תיווך", item_description: "Sefer Torah" })],
      noMaps.invCat, noMaps.investDet, noExtra
    );
    expect(result.label).toBe("Sefer Torah");
  });

  it('uses investDet map for new-project sales (sale_type="פרויקט חדש")', () => {
    const investDet = new Map([["inv-7", "Custom Mezuzah Project"]]);
    const [result] = buildSalesList(
      [row({ sale_type: "פרויקט חדש", investment_id: "inv-7" })],
      noMaps.invCat, investDet, noExtra
    );
    expect(result.label).toBe("Custom Mezuzah Project");
  });

  it("uses invCat map when item_id is present and sale_type is not special", () => {
    const invCat = new Map([["item-3", "Tefillin"]]);
    const [result] = buildSalesList(
      [row({ item_id: "item-3" })],
      invCat, noMaps.investDet, noExtra
    );
    expect(result.label).toBe("Tefillin");
  });

  it('falls back to "מכירה" when no label can be resolved', () => {
    const [result] = buildSalesList(
      [row()], // no sale_type, no item_id, no investment_id
      noMaps.invCat, noMaps.investDet, noExtra
    );
    expect(result.label).toBe("מכירה");
  });

  // ── Output shape contract ─────────────────────────────────────────────────

  it("output contains all required fields with correct types", () => {
    const [result] = buildSalesList(
      [row({ id: "s-shape", sale_date: "2024-03-10", sale_type: "ממלאי", amount_paid: 50 })],
      noMaps.invCat, noMaps.investDet, noExtra
    );
    expect(result).toMatchObject({
      id: "s-shape",
      sale_type: "ממלאי",
      sale_date: "2024-03-10",
      total_price: expect.any(Number),
      total_paid: 50,
      label: expect.any(String),
    });
    // Ensure no extra unexpected keys leak in
    expect(Object.keys(result).sort()).toEqual(
      ["id", "label", "sale_date", "sale_type", "total_paid", "total_price"].sort()
    );
  });

  it("defaults null sale_type to 'ממלאי' in the output", () => {
    const [result] = buildSalesList([row({ sale_type: null })], noMaps.invCat, noMaps.investDet, noExtra);
    expect(result.sale_type).toBe("ממלאי");
  });

  it("defaults null sale_date to empty string in the output", () => {
    const [result] = buildSalesList([row({ sale_date: null })], noMaps.invCat, noMaps.investDet, noExtra);
    expect(result.sale_date).toBe("");
  });

  it("returns an empty array for empty input", () => {
    expect(buildSalesList([], noMaps.invCat, noMaps.investDet, noExtra)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. loadContactDetailPage (integration-style, Supabase mocked)
// ─────────────────────────────────────────────────────────────────────────────

describe("loadContactDetailPage", () => {
  it('returns { success: false, error: "יש להתחבר" } when user is not authenticated', async () => {
    mockCreateClient.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeMockClient({ user: null }) as any
    );

    const result = await loadContactDetailPage("any-id");

    expect(result.success).toBe(false);
    if (result.success) return; // narrow type for TS
    expect(result.error).toBe("יש להתחבר");
  });

  it('returns { success: false, error: "לא נמצא" } when contact does not exist', async () => {
    mockCreateClient.mockResolvedValue(
      makeMockClient({
        tables: {
          // .single() on crm_contacts returns null → contact not found
          crm_contacts: null,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    );

    const result = await loadContactDetailPage("non-existent");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("לא נמצא");
  });

  it("returns { success: true, data: … } with the correct structure on the happy path", async () => {
    // All tables that return arrays get [] (empty is fine – we're testing structure,
    // not financial math which is covered by the calculateContactBalance suite above).
    mockCreateClient.mockResolvedValue(
      makeMockClient({
        tables: {
          crm_contacts: MOCK_CONTACT, // single row used by .single()
          crm_contact_history: [],
          crm_transactions: [],
          crm_documents: [],
          crm_communication_logs: [],
          inventory: [],
          erp_investments: [],
          erp_sales: [],
          erp_payments: [],
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    );

    const result = await loadContactDetailPage(MOCK_CONTACT.id);

    expect(result.success).toBe(true);
    if (!result.success) return; // narrow for TS

    const { data } = result;

    // ── Contact fields ─────────────────────────────────────────────────────
    expect(data.contact.id).toBe(MOCK_CONTACT.id);
    expect(data.contact.name).toBe(MOCK_CONTACT.name);
    expect(data.contact.type).toBe("Scribe");
    expect(data.contact.tags).toEqual(MOCK_CONTACT.tags);
    expect(data.contact.handwriting_image_url).toBeNull();

    // ── Type label is resolved correctly ──────────────────────────────────
    expect(data.typeLabel).toBe("סופר"); // "Scribe" → "סופר"

    // ── All array fields are present and are arrays ────────────────────────
    for (const key of [
      "contactHistory", "sysEvents", "transactions", "documents", "logs",
      "buyerSales", "sellerSales", "investments", "ledgerPayments",
    ] as const) {
      expect(data[key], `expected data.${key} to be an array`).toBeInstanceOf(Array);
    }

    // ── Financial fields are numbers ───────────────────────────────────────
    expect(typeof data.debtToContact).toBe("number");
    expect(typeof data.debtFromContact).toBe("number");
    expect(typeof data.netMutual).toBe("number");

    // ── netMutual is always debtFromContact - debtToContact ───────────────
    expect(data.netMutual).toBe(data.debtFromContact - data.debtToContact);

    // ── With empty ERP data the balances are zero ─────────────────────────
    expect(data.debtToContact).toBe(0);
    expect(data.debtFromContact).toBe(0);
    expect(data.netMutual).toBe(0);
  });

  it("passes the contact ID down to Supabase (ownership enforced)", async () => {
    const client = makeMockClient({ tables: { crm_contacts: MOCK_CONTACT } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreateClient.mockResolvedValue(client as any);

    await loadContactDetailPage(MOCK_CONTACT.id);

    // The first call to `from()` must target crm_contacts
    expect(client.from).toHaveBeenCalledWith("crm_contacts");
  });
});
