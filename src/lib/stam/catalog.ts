/** Canonical STaM option sets — Market, Torah contracts, Inventory alignment */

export const STAM_SEFER_TORAH_SIZES = ["36", "42", "45", "48", "50", "56"] as const;
export type StamSeferTorahSize = (typeof STAM_SEFER_TORAH_SIZES)[number];

/** Market + calculator-style parchment (ספר תורה במאגר) */
export const MARKET_PARCHMENT_TYPES = ["שליל", "עור", "משוח"] as const;
export type MarketParchmentType = (typeof MARKET_PARCHMENT_TYPES)[number];

/** כתב — מאגר ספרי תורה */
export const STAM_SCRIPT_TYPES = ["ארי", "ב״י", "ספרדי"] as const;
export type StamScriptType = (typeof STAM_SCRIPT_TYPES)[number];

/** חוזה פרויקט ס״ת — סוג קלף */
export const TORAH_CONTRACT_PARCHMENT_TYPES = ["שליל", "בקר", "עור", "משוח"] as const;
export type TorahContractParchmentType = (typeof TORAH_CONTRACT_PARCHMENT_TYPES)[number];
