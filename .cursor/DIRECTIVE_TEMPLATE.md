# [DIRECTIVE: AUTONOMOUS FEATURE DEVELOPMENT - {שם המודול}]
Build the {שם המודול} module.

## [PHASE 1: SCAFFOLDING & TYPES]
1. Define strict Zod schemas for all new data structures in `lib/validations.ts`.
2. Create TypeScript interfaces based on the Supabase schema.

## [PHASE 2: SERVER ACTIONS (BULLETPROOF)]
1. Write Server Actions in `app/{נתיב}/actions.ts`.
2. Implement strict input validation using the Zod schemas from Phase 1.
3. Wrap all DB/API calls in `try/catch`. Return standardized `{ success, data, error }` objects.

## [PHASE 3: UI IMPLEMENTATION]
1. Build the UI components. Use `react-hook-form` integrated with the Zod schemas for form validation.
2. Handle all loading states (spinners/skeletons) and display `sonner` toasts for success/error based on the Server Action response.

## [PHASE 4: SELF-AUDIT & DEPLOY]
1. Run `npm run lint` and `npm run type-check` (or `tsc --noEmit`).
2. Run `npm run build`.
3. If errors occur, fix them autonomously.
4. If successful, commit and push to GitHub.
