## WhatsApp Text + Image Limitation

Current limitation:
- The system does not yet group a text message and a separately sent image into one business event.
- Each inbound message/media item may be stored as an independent interaction.

Why this matters:
- A single user intent (for example: description + photo) can appear as fragmented records.
- Downstream business workflows may over-count interactions.

Planned technical direction (not implemented in this issue):
- Group incoming WhatsApp items by the same chat/contact within a configurable time window.
- Build one aggregated interaction payload from grouped text + media.
- Persist one business interaction event while retaining raw message IDs for audit traceability.

Out of scope for this stabilization issue:
- No entity merge.
- No AI-based identity resolution.
