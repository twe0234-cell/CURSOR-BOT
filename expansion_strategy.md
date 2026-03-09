# Expansion Strategy - מערכת ניהול "הידור הסת"ם"

## 1. Project Overview
System for managing inventory, scribes, and customers.
* **Database & Auth:** Supabase
* **Deployment:** Vercel

## 2. Database Schema (Supabase) Requirements
* **Scribes (סופרים):** Table to track scribe details, active writing projects, and payment status.
* **Inventory (מלאי):** Table for STaM products (Sefer Torah, etc.), tracking product status, availability, and pricing.
* **Customers (לקוחות):** Table for customer contact info, order history, and current requests.

## 3. Development Phases
* **Phase 1:** Setup Supabase project, initialize database tables, and establish connection with the frontend.
* **Phase 2:** Implement user authentication (Admin login).
* **Phase 3:** Develop CRUD operations and UI for the Scribes management module.
* **Phase 4:** Develop CRUD operations and UI for the Inventory management module.
* **Phase 5:** Develop CRUD operations and UI for the Customers and Orders management module.
* **Phase 6:** Prepare for Vercel deployment, fix environment variables, and test build.

## 4. Cursor Agent Instructions
* Write modular, clean code.
* Always implement proper error handling for all Supabase database queries.
* Do not implement mock data if a Supabase connection can be established.
* Review existing files before generating new components to prevent duplication.