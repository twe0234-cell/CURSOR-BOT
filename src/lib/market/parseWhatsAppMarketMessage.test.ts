import { describe, expect, it } from "vitest";
import { STAM_SCRIPT_TYPES } from "@/src/lib/stam/catalog";
import {
  parseMarketTorahMessage,
  parsedMessageIsActionable,
  listMissingParseFields,
} from "./parseWhatsAppMarketMessage";

describe("parseMarketTorahMessage — פורמט חדש (ירידת שורה)", () => {
  it("דוגמה מלאה: ארי 48 יעקובוב 06/26 165.", () => {
    const p = parseMarketTorahMessage("ארי\n48\nיעקובוב\n06/26\n165.");
    expect(p.script_type).toBe("ארי");
    expect(p.torah_size).toBe("48");
    expect(p.owner_name).toBe("יעקובוב");
    expect(p.ready_date).toBe("2026-06-01");
    expect(p.asking_price_full_shekels).toBe(165_000);
    expect(parsedMessageIsActionable(p)).toBe(true);
  });

  it('ב"י עם מרכאות רגילות → ערך קנוני ל-DB (ב״י)', () => {
    const p = parseMarketTorahMessage('ב"י\n36\nכהן\nעוד חודש\n95');
    expect(p.script_type).toBe(STAM_SCRIPT_TYPES[1]);
    expect(p.torah_size).toBe("36");
    expect(p.owner_name).toBe("כהן");
    expect(p.asking_price_full_shekels).toBe(95_000);
    expect(parsedMessageIsActionable(p)).toBe(true);
  });

  it('אר"י עם מרכאות', () => {
    const p = parseMarketTorahMessage('אר"י\n42\nלוי\n\n180');
    expect(p.script_type).toBe("ארי");
    expect(p.torah_size).toBe("42");
    expect(p.owner_name).toBe("לוי");
    expect(p.ready_date).toBeNull();
    expect(p.asking_price_full_shekels).toBe(180_000);
    expect(parsedMessageIsActionable(p)).toBe(true);
  });

  it("ספרדי גודל 24 — שדות אופציונליים חסרים", () => {
    const p = parseMarketTorahMessage("ספרדי\n24\n\n\n200");
    expect(p.script_type).toBe("ספרדי");
    expect(p.torah_size).toBe("24");
    expect(p.owner_name).toBeNull();
    expect(p.ready_date).toBeNull();
    expect(p.asking_price_full_shekels).toBe(200_000);
    expect(parsedMessageIsActionable(p)).toBe(true);
  });

  it("גודל 30 — גודל חדש", () => {
    const p = parseMarketTorahMessage("ארי\n30\nברגר\n04.26\n120");
    expect(p.torah_size).toBe("30");
    expect(p.ready_date).toBe("2026-04-01");
    expect(p.asking_price_full_shekels).toBe(120_000);
  });

  it("מחיר בשקלים מלאים (> 1000)", () => {
    const p = parseMarketTorahMessage("ארי\n48\n\n\n185000");
    expect(p.asking_price_full_shekels).toBe(185_000);
  });

  it("מחיר עם פסיק כמפריד אלפים", () => {
    const p = parseMarketTorahMessage("ספרדי\n42\n\n\n185,000");
    expect(p.asking_price_full_shekels).toBe(185_000);
  });

  it("תאריך בפורמט MM.YY", () => {
    const p = parseMarketTorahMessage("ארי\n48\nאלון\n04.26\n150");
    expect(p.ready_date).toBe("2026-04-01");
  });

  it("תאריך: עוד חודשיים", () => {
    const p = parseMarketTorahMessage("ארי\n36\nדוד\nעוד חודשיים\n90");
    expect(p.ready_date).toBeTruthy();
    expect(p.ready_date).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("תאריך: עוד חצי שנה", () => {
    const p = parseMarketTorahMessage("ב\"י\n48\n\nעוד חצי שנה\n130");
    expect(p.ready_date).toBeTruthy();
  });

  it("ללא מחיר — not actionable", () => {
    const p = parseMarketTorahMessage("ארי\n48\nכהן\n06/26\n");
    expect(p.asking_price_full_shekels).toBeNull();
    expect(parsedMessageIsActionable(p)).toBe(false);
  });

  it("ללא גודל וכתב אך עם מחיר — actionable (מחיר לבד מספיק)", () => {
    const p = parseMarketTorahMessage("\n\nכהן\n06/26\n150");
    expect(p.torah_size).toBeNull();
    expect(p.script_type).toBeNull();
    expect(p.asking_price_full_shekels).toBe(150_000);
    expect(parsedMessageIsActionable(p)).toBe(true);
  });

  it('"מוכן" → חודש נוכחי', () => {
    const p = parseMarketTorahMessage("48\nכהן\nמוכן\n150");
    expect(p.torah_size).toBe("48");
    expect(p.ready_date).toMatch(/^\d{4}-\d{2}-01$/);
    expect(parsedMessageIsActionable(p)).toBe(true);
  });

  it('"זמין" → חודש נוכחי', () => {
    const p = parseMarketTorahMessage("ארי\n36\nזמין\n120");
    expect(p.ready_date).toMatch(/^\d{4}-\d{2}-01$/);
    expect(p.script_type).toBe("ארי");
  });

  it("CRLF — ממיר ל-LF", () => {
    const p = parseMarketTorahMessage("ארי\r\n48\r\nברק\r\n06/26\r\n165.");
    expect(p.script_type).toBe("ארי");
    expect(p.torah_size).toBe("48");
    expect(p.asking_price_full_shekels).toBe(165_000);
    expect(parsedMessageIsActionable(p)).toBe(true);
  });

  it("listMissingParseFields — מדווח על חסרים", () => {
    const p = parseMarketTorahMessage("ארי\n48\n\n\n");
    const missing = listMissingParseFields(p);
    expect(missing.some((m) => m.includes("מחיר"))).toBe(true);
  });

  it("גודל אחר", () => {
    const p = parseMarketTorahMessage("ארי\nאחר\nלוי\n\n200");
    expect(p.torah_size).toBe("אחר");
    expect(parsedMessageIsActionable(p)).toBe(true);
  });

  it("בי ללא מרכאות → ב״י קנוני", () => {
    const p = parseMarketTorahMessage("בי\n36\n\n\n100");
    expect(p.script_type).toBe(STAM_SCRIPT_TYPES[1]);
  });
});
