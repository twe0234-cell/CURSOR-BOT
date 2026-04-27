# Contact Business Activity Linking

## Scope

This document defines which contact-to-business links are currently reliable for the contact detail page, and which links are still missing.

Hard constraints applied in implementation:

- No contact intelligence/entity merge.
- No bulk historical backfill.
- No production data mutation.
- No destructive SQL.
- Read-only display from existing relationships only.

## Existing Reliable Links

### Contacts and roles

- Source table: `crm_contacts`
- Role-like values exist in `crm_contacts.type` (`Scribe`, `Merchant`, `End_Customer`, `Other`).
- Contact detail route loads a single contact by `id` + `user_id` ownership.

### Sales and deals

- Source table: `erp_sales`
- Reliable links:
  - Sales **to** contact: `erp_sales.buyer_id = crm_contacts.id`
  - Sales where contact is seller/broker side: `erp_sales.seller_id = crm_contacts.id`
- Inventory trace in sale exists only when `erp_sales.item_id` is populated.

### Purchases from contact (scribe workflow)

- Source table: `erp_investments`
- Reliable link:
  - Purchase/investment from contact: `erp_investments.scribe_id = crm_contacts.id`

### Inventory sourced from contact

- Source table: `inventory`
- Reliable link:
  - Source contact: `inventory.scribe_id = crm_contacts.id`
- This is the only current reliable contact-source key in inventory.

### Sold inventory sourced from contact (traceable path)

- Source tables: `inventory` + `erp_sales`
- Reliable trace path:
  - `inventory.scribe_id = contact.id`
  - `erp_sales.item_id = inventory.id`
- If a sale has no `item_id`, it cannot be safely linked to sourced inventory.

### Transactions and payment ledger

- Source table: `erp_payments`
- Links are reliable via `entity_type` + `entity_id` to:
  - `erp_sales.id`
  - `erp_investments.id`

### Market links

- Source table: `market_torah_books`
- Reliable links:
  - `sofer_id = crm_contacts.id`
  - `dealer_id = crm_contacts.id`
- Note: current Business Activity panel is focused on contact detail sales/investments/inventory and does not infer extra links beyond explicit FK references.

### Torah project links

- Source table: `torah_projects`
- Reliable direct links:
  - `client_id = crm_contacts.id`
  - `scribe_id = crm_contacts.id`
  - `current_holder_id = crm_contacts.id`

## Missing / Non-Reliable Links (No Auto-Backfill)

1. Inventory has no separate `supplier_id`/`vendor_id` relationship; source is modeled only as `scribe_id`.
2. Brokerage/project sales without `item_id` cannot be reliably tied to a specific inventory unit/source contact.
3. There is no guaranteed direct FK from `erp_investments` to `torah_projects`; therefore related Torah projects are shown only by direct contact role fields in `torah_projects`.
4. Legacy rows missing these FK columns remain intentionally unlinked until explicitly corrected by user-driven data edits.

## What Is Shown in Contact Profile (Read-Only Panel)

The Business Activity panel now shows:

- Purchases from this contact (`erp_investments.scribe_id`)
- Sales to this contact (`erp_sales.buyer_id`)
- Inventory sourced from this contact (`inventory.scribe_id`)
- Sold inventory sourced from this contact when traceable (`erp_sales.item_id -> inventory.id`)
- Totals for the above only when directly computable from linked rows
- Related Torah projects only through direct role fields in `torah_projects`
- Explicit "missing links" notes in the UI (no fake/inferred joins)

