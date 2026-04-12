-- 067: email_logs — הוספת סטטוס 'failed' לאילוץ CHECK
-- קמפיין/actions.ts מנסה לכתוב status='failed' אך האילוץ הנוכחי מונע זאת (sent|open|unsub בלבד)

ALTER TABLE public.email_logs
  DROP CONSTRAINT IF EXISTS email_logs_status_check;

ALTER TABLE public.email_logs
  ADD CONSTRAINT email_logs_status_check
    CHECK (status IN ('sent', 'open', 'unsub', 'failed'));

COMMENT ON COLUMN public.email_logs.status IS
  'sent=נשלח | open=נפתח | unsub=הסיר מנוי | failed=כישלון שליחה';

NOTIFY pgrst, 'reload schema';
