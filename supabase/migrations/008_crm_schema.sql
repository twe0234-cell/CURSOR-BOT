-- Hidur HaStam Buddy OS - Unified CRM Core
-- crm_contacts: central contact table
CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Other' CHECK (type IN ('Scribe', 'Merchant', 'End_Customer', 'Other')),
  preferred_contact TEXT DEFAULT 'WhatsApp' CHECK (preferred_contact IN ('WhatsApp', 'Email', 'Phone')),
  wa_chat_id TEXT,
  email TEXT,
  phone TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- crm_transactions: debts/credits
CREATE TABLE IF NOT EXISTS public.crm_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Debt', 'Credit')),
  description TEXT,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- crm_documents: file links
CREATE TABLE IF NOT EXISTS public.crm_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  doc_type TEXT DEFAULT 'Other',
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- crm_communication_logs: WhatsApp/Email history
CREATE TABLE IF NOT EXISTS public.crm_communication_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('WhatsApp', 'Email', 'Phone')),
  content TEXT,
  direction TEXT CHECK (direction IN ('inbound', 'outbound')),
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_contacts_user_id ON public.crm_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_email ON public.crm_contacts(user_id, email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_contacts_wa_chat_id ON public.crm_contacts(user_id, wa_chat_id) WHERE wa_chat_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_transactions_contact ON public.crm_transactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_documents_contact ON public.crm_documents(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_comm_logs_contact ON public.crm_communication_logs(contact_id);

-- RLS
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_communication_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_contacts_select" ON public.crm_contacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "crm_contacts_insert" ON public.crm_contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "crm_contacts_update" ON public.crm_contacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "crm_contacts_delete" ON public.crm_contacts FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "crm_transactions_select" ON public.crm_transactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.crm_contacts c WHERE c.id = contact_id AND c.user_id = auth.uid())
);
CREATE POLICY "crm_transactions_insert" ON public.crm_transactions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.crm_contacts c WHERE c.id = contact_id AND c.user_id = auth.uid())
);
CREATE POLICY "crm_transactions_update" ON public.crm_transactions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.crm_contacts c WHERE c.id = contact_id AND c.user_id = auth.uid())
);
CREATE POLICY "crm_transactions_delete" ON public.crm_transactions FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.crm_contacts c WHERE c.id = contact_id AND c.user_id = auth.uid())
);

CREATE POLICY "crm_documents_select" ON public.crm_documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.crm_contacts c WHERE c.id = contact_id AND c.user_id = auth.uid())
);
CREATE POLICY "crm_documents_insert" ON public.crm_documents FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.crm_contacts c WHERE c.id = contact_id AND c.user_id = auth.uid())
);
CREATE POLICY "crm_documents_delete" ON public.crm_documents FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.crm_contacts c WHERE c.id = contact_id AND c.user_id = auth.uid())
);

CREATE POLICY "crm_comm_logs_select" ON public.crm_communication_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.crm_contacts c WHERE c.id = contact_id AND c.user_id = auth.uid())
);
CREATE POLICY "crm_comm_logs_insert" ON public.crm_communication_logs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.crm_contacts c WHERE c.id = contact_id AND c.user_id = auth.uid())
);
