# Contact Business Activity Linking

## Goal

Show reliable business history on a CRM contact profile without guessing or backfilling historical data.

## Reliable Links Used

- `erp_sales.buyer_id`: sales to this contact.
- `erp_sales.seller_id`: brokerage / owner sales where this contact is the seller.
- `inventory.scribe_id`: inventory sourced from this contact.
- `erp_sales.item_id -> inventory.id -> inventory.scribe_id`: sales of inventory sourced from this contact.
- `erp_investments.scribe_id`: legacy writing/investment projects where this contact is the scribe.
- `torah_projects.client_id`: Torah projects where this contact is the client.
- `torah_projects.scribe_id`: Torah projects where this contact is the scribe.
- `torah_projects.current_holder_id`: Torah projects currently held by this contact.
- `torah_projects.tagger_contact_id`: Torah projects where this contact is the tagger.
- `erp_payments.entity_type/entity_id`: payments linked to sales/investments already tied to the contact.

## Not Faked

Historical rows that only mention a person by free text cannot be shown as linked activity. Example: if a purchase says "אורי שוהם" in notes/description but has no `inventory.scribe_id`, `seller_id`, or other contact FK, the CRM profile will not treat it as this contact.

## Missing Link Fields / Actions

- Purchases from suppliers need an explicit contact FK at creation time. Current reliable source is `inventory.scribe_id`; generic supplier purchases should use a future `supplier_contact_id` if supplier and scribe are not the same role.
- `torah_project_transactions` has `project_id` and `transaction_type`, but no direct `contact_id`. Payments can be inferred only through the project role and transaction type, so the profile currently avoids treating those as direct contact payments unless a linked sale/investment payment exists.
- Free-text historical sales, purchases, WhatsApp messages, and notes need a reviewed/manual linking action before they appear as business activity.

## Recommended Next Step

Add contact selectors to every purchase/sale/project entry form where missing, and optionally build a reviewed "suggested links" queue. Do not auto-link old records by name alone.
