export const EMAIL_CAMPAIGN_BATCH_SIZE = 50;
export const EMAIL_CAMPAIGN_THROTTLE_MS = 800;

export type CampaignRecipient = {
  id: string;
  email: string;
  name: string;
};

export type CampaignChunk<T> = {
  index: number;
  items: T[];
};

export function dedupeRecipients(recipients: CampaignRecipient[]): CampaignRecipient[] {
  const byEmail = new Map<string, CampaignRecipient>();
  for (const r of recipients) {
    const key = r.email.trim().toLowerCase();
    if (!key) continue;
    if (!byEmail.has(key)) byEmail.set(key, { ...r, email: key });
  }
  return [...byEmail.values()];
}

export function chunkRecipients<T>(items: T[], size = EMAIL_CAMPAIGN_BATCH_SIZE): CampaignChunk<T>[] {
  if (size <= 0) return [{ index: 0, items: [...items] }];
  const chunks: CampaignChunk<T>[] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push({ index: chunks.length, items: items.slice(i, i + size) });
  }
  return chunks;
}

export async function throttleBetweenSends(ms = EMAIL_CAMPAIGN_THROTTLE_MS): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
