-- =====================================================================
--  MOBILE 4 YOU — COMPLETE DATABASE (one file, final version)
--  Supabase → SQL Editor → New query → paste ALL of this → Run (once, on an EMPTY project)
--
--  BEFORE running:
--    1. Storage → New bucket → name  product-images  → Public bucket ON
--    2. Database → Extensions → enable  pg_net  and  pg_cron  (if they are off)
--    3. Go to the very last section (section 9) and replace the 2 values
--       YOUR-PROJECT-REF and PUT_YOUR_WEBHOOK_SECRET   (or edit them later and run only that section)
--
--  What is inside (every object appears ONCE, in its final form):
--    1  extensions
--    2  tables, functions, triggers, indexes, row-level-security rules (everything in schema public)
--    3  the trigger that creates a profile for every new login (on auth.users)
--    4  permissions (who may call which function)
--    5  live updates for the notification bell (Realtime)
--    6  photo-bucket rules (Storage)
--    7  starting data (settings + the translation phrases for notifications)
--    8  daily reminders (09:00 and 20:00)
--    9  phone push: the function that calls send-push  <-- EDIT 2 VALUES
--
--  To change something later: edit it HERE (this file is the single source of truth),
--  then run only the part you changed on your live database (functions are
--  "create or replace", so they are safe to run again).
-- =====================================================================

-- 1 ---------------------------------------------------------------- extensions
create extension if not exists pgcrypto with schema extensions;   -- gen_random_bytes() for the tracking token
create extension if not exists pg_net  with schema extensions;    -- lets the database call the send-push function
create extension if not exists pg_cron;                           -- daily reminders

-- 2 ---------------------------------------------------------------- schema public
SET check_function_bodies = false;   -- functions may mention tables created further down

--
-- Name: acknowledge_order(text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.acknowledge_order(p_token text, p_eta timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update repair_orders
     set client_acknowledged = true,
         client_acknowledged_at = now(),
         client_pickup_eta = p_eta
   where access_token = p_token
     and status = 'ready'
     and coalesce(client_acknowledged, false) = false;
  return found;
end $$;

--
-- Name: add_debt_payment(uuid, numeric, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_debt_payment(p_debt uuid, p_amount numeric, p_from_register boolean DEFAULT false, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare d debts; ctx uuid;
begin
  select * into d from debts where id = p_debt for update;
  if not found then raise exception 'debt not found'; end if;
  if get_my_role() not in ('admin','super_admin')
     and not (get_my_role() = 'comptoir' and d.kind = 'client_unpaid') then
    raise exception 'not allowed';
  end if;
  if p_amount <= 0 or p_amount > d.amount - d.paid_amount then
    raise exception 'amount must be between 0 and remaining (%)', d.amount - d.paid_amount;
  end if;
  -- register effect:
  --   client_unpaid   -> money in, always
  --   supplier_unpaid -> money out only if the admin says it came from the register
  --   money_lent      -> money back IN only if the loan originally left the drawer (from_register)
  if d.kind = 'client_unpaid' then
    insert into cash_transactions (type, source_type, reference_id, amount, performed_by, description)
    values ('debt_collection','debt_collection', d.id, p_amount, auth.uid(), 'تحصيل دين — ' || d.party_name || ' — ' || d.description)
    returning id into ctx;
  elsif d.kind = 'money_lent' and d.from_register then
    insert into cash_transactions (type, source_type, reference_id, amount, performed_by, description)
    values ('loan_return','loan_return', d.id, p_amount, auth.uid(), 'رجوع سلفة — ' || d.party_name || ' — ' || d.description)
    returning id into ctx;
  elsif d.kind = 'supplier_unpaid' and p_from_register then
    insert into cash_transactions (type, source_type, reference_id, amount, performed_by, description)
    values ('expense_out','debt_payment', d.id, p_amount, auth.uid(), 'تسديد دين — ' || d.party_name || ' — ' || d.description)
    returning id into ctx;
  end if;
  insert into debt_payments (debt_id, amount, from_register, note, cash_transaction_id)
  values (p_debt, p_amount, p_from_register, p_note, ctx);
  perform refresh_debt(p_debt);
end $$;

--
-- Name: apply_discount_percent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_discount_percent() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.final_price is not null
     and (new.discount_percent > 0
          or (tg_op = 'UPDATE' and new.discount_percent is distinct from old.discount_percent)) then
    new.discount := round(new.final_price * new.discount_percent / 100, 2);
  end if;
  return new;
end $$;

--
-- Name: compute_claim_deadline(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_claim_deadline() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.delivered_at is not null then
    new.claim_deadline := new.delivered_at + (new.claim_window_hours || ' hours')::interval;
  end if;
  return new;
end;
$$;

--
-- Name: get_my_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ select role from public.profiles where id = auth.uid() $$;

--
-- Name: guard_technicien_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_technicien_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.status is distinct from old.status
     and new.status in ('ready', 'delivered', 'cancelled')
     and get_my_role() = 'technicien' then
    raise exception 'التسليم والإلغاء من طرف الاستقبال فقط';
  end if;
  return new;
end $$;

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'comptoir')
  );
  return new;
end;
$$;

--
-- Name: log_loan_out(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_loan_out() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.kind = 'money_lent' and new.from_register then
    insert into cash_transactions (type, source_type, reference_id, amount, performed_by, description)
    values ('expense_out','loan_out', new.id, new.amount, new.created_by,
            'سلفة من الصندوق — ' || new.party_name || ' — ' || new.description);
  end if;
  return new;
end $$;

--
-- Name: log_repair_income(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_repair_income() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare amt numeric;
begin
  if new.status = 'delivered' and coalesce(new.price_confirmed,false) = true
     and coalesce(new.final_price,0) > 0
     and not exists (select 1 from cash_transactions
                     where reference_id = new.id and source_type = 'repair_income')
  then
    amt := new.final_price - coalesce(new.discount,0) - coalesce(new.unpaid_amount,0);
    if amt > 0 then
      insert into cash_transactions (type, source_type, reference_id, amount, performed_by, description)
      values ('repair_income','repair_income', new.id, amt,
              coalesce(new.delivered_by, auth.uid()), new.order_number || ' — ' || new.device_model);
    end if;
  end if;
  return new;
end $$;

--
-- Name: mark_order_unpaid(uuid, numeric, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_order_unpaid(p_order uuid, p_unpaid numeric, p_deliver boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare o repair_orders; cname text; total numeric;
begin
  if get_my_role() not in ('admin','comptoir','super_admin') then raise exception 'not allowed'; end if;
  select * into o from repair_orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  total := coalesce(o.final_price,0) - coalesce(o.discount,0);
  if p_unpaid <= 0 or p_unpaid > total then raise exception 'unpaid must be between 0 and % ', total; end if;
  if exists (select 1 from debts where repair_order_id = p_order and kind = 'client_unpaid') then
    raise exception 'a debt is already recorded for this order';
  end if;
  select full_name into cname from clients where id = o.client_id;
  -- set BEFORE delivering so the income trigger (D3) only counts what was really paid
  update repair_orders set unpaid_amount = p_unpaid where id = p_order;
  insert into debts (kind, party_name, client_id, repair_order_id, description, amount, created_by)
  values ('client_unpaid', coalesce(cname,'—'), o.client_id, p_order,
          o.order_number || ' — ' || o.device_model, p_unpaid, auth.uid());
  -- order was already delivered and counted in full: take the unpaid part back out
  update cash_transactions set amount = amount - p_unpaid
   where reference_id = p_order and source_type = 'repair_income' and not is_void;
  if p_deliver and o.status <> 'delivered' then
    update repair_orders set status = 'delivered', delivered_at = now(), delivered_by = auth.uid()
     where id = p_order;
  end if;
end $$;

--
-- Name: notif_tr(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_tr(txt text, lang text) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r record;
begin
  if txt is null then return null; end if;
  for r in select ar, fr, en from notif_phrases order by length(ar) desc loop
    txt := replace(txt, r.ar, case when lang = 'en' then r.en else r.fr end);
  end loop;
  return txt;
end $$;

--
-- Name: notifications_translate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notifications_translate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  new.title_fr   := coalesce(new.title_fr,   notif_tr(new.title,   'fr'));
  new.message_fr := coalesce(new.message_fr, notif_tr(new.message, 'fr'));
  new.title_en   := coalesce(new.title_en,   notif_tr(new.title,   'en'));
  new.message_en := coalesce(new.message_en, notif_tr(new.message, 'en'));
  return new;
end $$;

--
-- Name: notify_big_sale(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_big_sale() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare lim numeric; r text; nm text;
begin
  select coalesce((select value::numeric from app_settings where key = 'big_sale_threshold'), 300) into lim;
  select role into r from profiles where id = new.seller_id;
  if new.total >= lim and coalesce(r,'') not in ('admin','super_admin') then
    select name into nm from accessories where id = new.accessory_id;
    insert into notifications (recipient_role, type, title, message, link_path)
    values ('admin', 'big_sale', 'عملية بيع كبيرة', coalesce(nm,'منتج') || ' — ' || new.total || ' د.ت', '/caisse');
  end if;
  return new;
end $$;

--
-- Name: notify_cash_withdrawal(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_cash_withdrawal() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare who text; r text;
begin
  if new.type = 'withdrawal' then
    select full_name, role into who, r from profiles where id = new.performed_by;
    if coalesce(r,'') not in ('admin','super_admin') then
      insert into notifications (recipient_role, type, title, message, link_path)
      values ('admin', 'cash_withdrawal', 'سحب من الصندوق',
              coalesce(who,'موظف') || ' سحب ' || new.amount || ' د.ت', '/caisse');
    end if;
  end if;
  return new;
end $$;

--
-- Name: notify_client_ack(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_client_ack() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare eta_text text;
begin
  if new.client_acknowledged = true and old.client_acknowledged = false then
    eta_text := case
      when new.client_pickup_eta is not null
      then ' — رح يجي: ' || to_char(new.client_pickup_eta at time zone 'Africa/Tunis', 'DD/MM') || ' الساعة ' || to_char(new.client_pickup_eta at time zone 'Africa/Tunis', 'HH24:MI')
      else ' (بدون تحديد وقت)'
    end;
    insert into notifications (recipient_id, type, title, message, related_order_id)
    values (new.comptoir_id, 'client_ack', 'الحريف أكد الاستلام',
            'حريف الطلب ' || new.order_number || ' أكد أنو عارف جهازو جاهز' || eta_text, new.id);
  end if;
  return new;
end;
$$;

--
-- Name: notify_debt_added(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_debt_added() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare who text; who_role text;
begin
  select full_name, role into who, who_role from profiles where id = new.created_by;
  if who_role not in ('admin','super_admin') then
    insert into notifications (recipient_role, type, title, message, link_path)
    values ('admin','debt_added','دين جديد على حريف',
            who || ' سجّل ' || new.amount || ' د.ت على ' || new.party_name || ' — ' || new.description,
            '/admin/debts');
  end if;
  return new;
end $$;

--
-- Name: notify_debt_payment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_debt_payment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r text; pn text;
begin
  select role into r from profiles where id = new.received_by;
  if coalesce(r,'') not in ('admin','super_admin') then
    select party_name into pn from debts where id = new.debt_id;
    insert into notifications (recipient_role, type, title, message, link_path)
    values ('admin', 'debt_payment', 'تم استلام دفعة دين', coalesce(pn,'') || ' — ' || new.amount || ' د.ت', '/admin/debts');
  end if;
  return new;
end $$;

--
-- Name: notify_debt_settled(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_debt_settled() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if old.status = 'open' and new.status = 'settled' and new.kind = 'client_unpaid'
     and new.created_by is distinct from auth.uid() then
    insert into notifications (recipient_id, type, title, message, link_path)
    values (new.created_by, 'debt_settled', 'تمت تسوية دين', new.party_name || ' — ' || new.amount || ' د.ت', '/comptoir/debts');
  end if;
  return new;
end $$;

--
-- Name: notify_discount_decision(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_discount_decision() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare ttl text; msg text;
begin
  if new.discount_decision is not distinct from old.discount_decision then return new; end if;
  ttl := case when new.discount_decision = 'applied' then 'تم تطبيق تخفيض الفيديل ' || new.discount_percent || '%'
              else 'تم رفض تخفيض الفيديل' end;
  msg := new.order_number || ' · ' || new.device_model;
  if auth.uid() is not distinct from new.technician_id then
    if new.comptoir_id is not null then
      insert into notifications (recipient_id, type, title, message, related_order_id, link_path)
      values (new.comptoir_id, 'discount_applied', ttl, msg, new.id, '/o/' || new.order_number);
    end if;
  elsif new.technician_id is not null then
    insert into notifications (recipient_id, type, title, message, related_order_id, link_path)
    values (new.technician_id, 'discount_applied', ttl, msg, new.id, '/technicien/order/' || new.id);
  end if;
  return new;
end $$;

--
-- Name: notify_expense_result(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_expense_result() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.is_approved is true and old.is_approved is not true
     and new.spent_by is distinct from new.approved_by then
    insert into notifications (recipient_id, type, title, message)
    values (new.spent_by, 'expense_result', 'تمت الموافقة على مصروفك', new.amount || ' د.ت — ' || new.description);
  end if;
  return new;
end $$;

--
-- Name: notify_fidele(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_fidele() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.is_fidele is true and old.is_fidele is not true then
    insert into notifications (recipient_role, type, title, message, link_path)
    values ('comptoir', 'fidele', 'عميل فيديل جديد ⭐', new.full_name || ' — طبّق تخفيض الفيديل في الزيارة القادمة', '/comptoir/clients');
  end if;
  return new;
end $$;

--
-- Name: notify_fidele_order(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_fidele_order() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare c clients;
begin
  select * into c from clients where id = new.client_id;
  if c.is_fidele is true and new.technician_id is not null and new.technician_id is distinct from auth.uid() then
    insert into notifications (recipient_id, type, title, message, related_order_id, link_path)
    values (new.technician_id, 'fidele_order', 'عميل فيديل ⭐',
            c.full_name || ' — ' || new.order_number || ' · يمكنك تطبيق التخفيض من تفاصيل الطلب',
            new.id, '/technicien/order/' || new.id);
  end if;
  return new;
end $$;

--
-- Name: notify_general_expense_pending(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_general_expense_pending() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  who text;
  who_role text;
begin
  select full_name, role into who, who_role from profiles where id = new.spent_by;
  if who_role not in ('admin','super_admin') then
    insert into notifications (recipient_role, type, title, message, related_general_expense_id, link_path)
    values ('admin', 'expense_added', 'مصروف جديد بانتظار الاعتماد',
            who || ' سجّل ' || new.amount || ' د.ت — ' || new.description,
            new.id, '/admin/expenses-approval');
  end if;
  return new;
end;
$$;

--
-- Name: notify_low_stock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_low_stock() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare ttl text;
begin
  if new.category = 'accessory' and coalesce(new.is_deleted,false) = false
     and new.stock_quantity <= coalesce(new.low_stock_threshold,3)
     and old.stock_quantity > coalesce(old.low_stock_threshold,3) then
    ttl := case when new.stock_quantity <= 0 then 'نفد المخزون' else 'المخزون على وشك النفاد' end;
    insert into notifications (recipient_role, type, title, message, link_path) values
      ('admin',    'low_stock', ttl, new.name || ' — المتبقي: ' || new.stock_quantity, '/admin/accessories'),
      ('comptoir', 'low_stock', ttl, new.name || ' — المتبقي: ' || new.stock_quantity, '/comptoir/sell');
  end if;
  return new;
end $$;

--
-- Name: notify_new_order(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_new_order() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into notifications (recipient_role, type, title, message, related_order_id)
  values ('admin', 'new_order', 'طلب صيانة جديد',
          'تم استقبال جهاز ' || new.device_model || ' — رقم الطلب ' || new.order_number,
          new.id);
  return new;
end;
$$;

--
-- Name: notify_order_assigned(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_order_assigned() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.technician_id is not null and new.technician_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.technician_id is distinct from old.technician_id) then
    insert into notifications (recipient_id, type, title, message, related_order_id, link_path)
    values (new.technician_id, 'order_assigned', 'جهاز جديد لك',
            'تم إسناد ' || new.device_model || ' — الطلب ' || new.order_number,
            new.id, '/technicien/order/' || new.id);
  end if;
  if tg_op = 'INSERT' and new.technician_id is null then
    insert into notifications (recipient_role, type, title, message, related_order_id, link_path)
    values ('technicien', 'order_unassigned', 'جهاز جديد بانتظار تقني',
            new.device_model || ' — ' || new.order_number, new.id, '/technicien');
  end if;
  return new;
end $$;

--
-- Name: notify_price_set(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_price_set() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if coalesce(new.final_price,0) > 0 and new.final_price is distinct from old.final_price
     and new.status not in ('delivered','cancelled') and new.comptoir_id is not null
     and new.comptoir_id is distinct from auth.uid() then
    insert into notifications (recipient_id, type, title, message, related_order_id, link_path)
    values (new.comptoir_id, 'price_set', 'التقني حدّد السعر النهائي',
            new.order_number || ' · ' || new.final_price || ' د.ت — راجعه وأكّده', new.id, '/o/' || new.order_number);
  end if;
  return new;
end $$;

--
-- Name: notify_repair_expense_pending(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_repair_expense_pending() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  who text;
  who_role text;
begin
  select full_name, role into who, who_role from profiles where id = new.spent_by;
  if who_role not in ('admin','super_admin') then
    insert into notifications (recipient_role, type, title, message, link_path)
    values ('admin', 'expense_added', 'مصروف قطعة غيار بانتظار الاعتماد',
            who || ' سجّل ' || (new.purchase_price * new.quantity) || ' د.ت — ' || new.item_name,
            '/admin/expenses-approval');
  end if;
  return new;
end;
$$;

--
-- Name: notify_repair_expense_result(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_repair_expense_result() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare who uuid;
begin
  who := coalesce(new.spent_by, new.technician_id);
  if new.is_approved is true and old.is_approved is not true and who is not null
     and who is distinct from new.approved_by then
    insert into notifications (recipient_id, type, title, message)
    values (who, 'expense_result', 'تمت الموافقة على مصروف القطع',
            new.item_name || ' — ' || (new.purchase_price * coalesce(new.quantity,1)) || ' د.ت');
  end if;
  return new;
end $$;

--
-- Name: notify_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare lbl text; ttl text; typ text; info text;
begin
  if new.status is not distinct from old.status then return new; end if;
  lbl := case new.status when 'received' then 'تم الاستلام' when 'diagnosing' then 'قيد الفحص'
         when 'in_repair' then 'قيد الإصلاح' when 'ready' then 'جاهز للتسليم'
         when 'delivered' then 'تم التسليم' when 'cancelled' then 'ملغى' else new.status end;
  ttl := case new.status when 'ready' then 'الجهاز جاهز ✅'
         when 'cancelled' then 'تم إلغاء الطلب' else 'تغيّرت حالة الطلب' end;
  typ := case new.status when 'ready' then 'order_ready' when 'cancelled' then 'order_cancelled' else 'status_change' end;
  info := new.order_number || ' · ' || new.device_model || ' — ' || lbl;
  if new.status = 'ready' then info := info || ' — العميل يرى الرسالة في صفحة التتبع وسيؤكد قدومه'; end if;

  if new.comptoir_id is not null and new.comptoir_id is distinct from auth.uid() then
    insert into notifications (recipient_id, type, title, message, related_order_id, link_path)
    values (new.comptoir_id, typ, ttl, info, new.id, '/o/' || new.order_number);
  end if;
  if new.status in ('delivered','cancelled') then
    insert into notifications (recipient_role, type, title, message, related_order_id, link_path)
    values ('admin', typ, ttl, info, new.id, '/o/' || new.order_number);
  end if;
  if new.status = 'cancelled' and new.technician_id is not null and new.technician_id is distinct from auth.uid() then
    insert into notifications (recipient_id, type, title, message, related_order_id, link_path)
    values (new.technician_id, 'order_cancelled', ttl, info, new.id, '/technicien/order/' || new.id);
  end if;
  return new;
end $$;

--
-- Name: notify_void_request(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_void_request() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare who text; who_role text; d text; a numeric;
begin
  select full_name, role into who, who_role from profiles where id = new.requested_by;
  if who_role not in ('admin','super_admin') then
    select description, amount into d, a from cash_transactions where id = new.cash_transaction_id;
    insert into notifications (recipient_role, type, title, message, link_path)
    values ('admin','void_request','طلب إلغاء عملية بانتظار الموافقة',
            who || ' يطلب إلغاء ' || a || ' د.ت — ' || coalesce(d,'') || ' | السبب: ' || new.reason,
            '/admin/void-requests');
  end if;
  return new;
end $$;

--
-- Name: notify_void_result(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_void_result() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if old.status = 'pending' and new.status in ('approved','rejected') then
    insert into notifications (recipient_id, type, title, message, link_path)
    values (new.requested_by, 'void_result',
            case when new.status = 'approved' then 'تمت الموافقة على الإلغاء' else 'تم رفض طلب الإلغاء' end,
            coalesce(nullif(new.review_note,''), new.reason), '/caisse');
  end if;
  return new;
end $$;

--
-- Name: refresh_debt(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_debt(p uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare s numeric;
begin
  select coalesce(sum(amount),0) into s from debt_payments where debt_id = p and not is_void;
  update debts set paid_amount = s,
         status     = case when s >= amount then 'settled' else 'open' end,
         settled_at = case when s >= amount then now() else null end
   where id = p;
end $$;

--
-- Name: reset_price_confirmation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_price_confirmation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.final_price is distinct from old.final_price then
    new.price_confirmed := false;
  end if;
  return new;
end;
$$;

--
-- Name: restock_on_void(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.restock_on_void() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare s accessory_sales;
begin
  if new.is_void and not old.is_void and new.source_type in ('accessory_sale','phone_sale') then
    select * into s from accessory_sales where id = new.reference_id;
    if found then
      update accessories
         set stock_quantity = stock_quantity + s.quantity,
             sold_quantity  = greatest(0, sold_quantity - s.quantity)
       where id = s.accessory_id;
    end if;
  end if;
  return new;
end $$;

--
-- Name: review_void_request(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.review_void_request(p_id uuid, p_approve boolean, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r void_requests; did uuid; ct cash_transactions;
begin
  if get_my_role() not in ('admin','super_admin') then raise exception 'admin only'; end if;
  select * into r from void_requests where id = p_id and status = 'pending' for update;
  if not found then raise exception 'request not found or already reviewed'; end if;
  update void_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(), review_note = p_note, reviewed_at = now()
   where id = p_id;
  if p_approve then
    update cash_transactions
       set is_void = true, void_reason = r.reason, voided_by = auth.uid()
     where id = r.cash_transaction_id
     returning * into ct;
    -- voiding a "loan taken from the drawer" row = it did NOT come from the drawer:
    -- the loan stays, but its returns must no longer be added to the register
    if ct.source_type = 'loan_out' then
      update debts set from_register = false where id = ct.reference_id;
    end if;
    -- if the voided row was a debt payment, re-open that debt (function from part H)
    if to_regclass('public.debt_payments') is not null then
      update debt_payments set is_void = true
       where cash_transaction_id = r.cash_transaction_id returning debt_id into did;
      if did is not null then perform refresh_debt(did); end if;
    end if;
  end if;
end $$;

--
-- Name: run_evening_summary(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_evening_summary() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare inc numeric; outc numeric; dlv int;
begin
  select coalesce(sum(amount) filter (where type in ('repair_income','accessory_sale','debt_collection','loan_return')),0),
         coalesce(sum(amount) filter (where type in ('expense_out','withdrawal')),0)
    into inc, outc from cash_transactions
   where not coalesce(is_void,false)
     and (created_at at time zone 'Africa/Tunis')::date = (now() at time zone 'Africa/Tunis')::date;
  select count(*) into dlv from repair_orders
   where status = 'delivered'
     and (delivered_at at time zone 'Africa/Tunis')::date = (now() at time zone 'Africa/Tunis')::date;
  insert into notifications (recipient_role, type, title, message, link_path)
  values ('admin','daily_summary','ملخص اليوم 📊',
          'دخل ' || inc || ' د.ت · مصاريف ' || outc || ' د.ت · تسليمات ' || dlv, '/admin/reports/daily');
end $$;

--
-- Name: run_morning_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_morning_notifications() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare n int; amt numeric; r record;
begin
  -- devices ready for 2+ days and still not collected -> comptoir
  select count(*) into n from repair_orders where status = 'ready' and ready_at < now() - interval '2 days';
  if n > 0 then
    insert into notifications (recipient_role, type, title, message, link_path)
    values ('comptoir','ready_waiting','أجهزة جاهزة تنتظر العميل', n || ' جهاز جاهز منذ أكثر من يومين ولم يُستلم بعد', '/comptoir');
  end if;
  -- client debts due / overdue -> comptoir ; every debt kind -> admin
  select count(*), coalesce(sum(amount - paid_amount),0) into n, amt from debts
   where status = 'open' and kind = 'client_unpaid' and due_date is not null and due_date <= current_date;
  if n > 0 then
    insert into notifications (recipient_role, type, title, message, link_path)
    values ('comptoir','debt_due','ديون مستحقة', n || ' دين — المجموع ' || amt || ' د.ت', '/comptoir/debts');
  end if;
  select count(*), coalesce(sum(amount - paid_amount),0) into n, amt from debts
   where status = 'open' and due_date is not null and due_date <= current_date;
  if n > 0 then
    insert into notifications (recipient_role, type, title, message, link_path)
    values ('admin','debt_due','ديون مستحقة', n || ' دين — المجموع ' || amt || ' د.ت', '/admin/debts');
  end if;
  -- things waiting for the admin's approval
  select (select count(*) from void_requests where status = 'pending')
       + (select count(*) from general_expenses where is_approved = false)
       + (select count(*) from repair_expenses  where is_approved = false) into n;
  if n > 0 then
    insert into notifications (recipient_role, type, title, message, link_path)
    values ('admin','pending_digest','طلبات بانتظار موافقتك', n || ' طلب (إلغاءات + مصاريف)', '/admin/expenses-approval');
  end if;
  -- devices stuck 3+ days in the workshop: one line for admin, one per technicien
  select count(*) into n from repair_orders
   where status in ('received','diagnosing','in_repair') and created_at < now() - interval '3 days';
  if n > 0 then
    insert into notifications (recipient_role, type, title, message, link_path)
    values ('admin','stuck_orders','أجهزة متأخرة في الورشة', n || ' جهاز أكثر من 3 أيام بدون تسليم', '/admin');
  end if;
  for r in select technician_id as tid, count(*) as c from repair_orders
           where status in ('received','diagnosing','in_repair') and created_at < now() - interval '3 days'
             and technician_id is not null group by technician_id
  loop
    insert into notifications (recipient_id, type, title, message, link_path)
    values (r.tid, 'stuck_orders', 'أجهزة متأخرة عندك', r.c || ' جهاز أكثر من 3 أيام', '/technicien');
  end loop;
end $$;

--
-- Name: save_push_subscription(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_ua text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  delete from push_subscriptions where endpoint = p_endpoint;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_ua);
end $$;

--
-- Name: sell_accessory(uuid, integer, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sell_accessory(p_accessory_id uuid, p_quantity integer, p_client_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'cash'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  a accessories;
  sale_id uuid;
  ct_id uuid;
begin
  if get_my_role() not in ('admin','super_admin','comptoir') then
    raise exception 'not allowed';
  end if;
  select * into a from accessories where id = p_accessory_id and not is_deleted for update;
  if not found then raise exception 'product not found'; end if;
  if p_quantity <= 0 then raise exception 'quantity must be positive'; end if;
  if a.category = 'phone' and p_quantity <> 1 then raise exception 'a phone is sold one at a time'; end if;
  if a.stock_quantity < p_quantity then raise exception 'not enough stock (% left)', a.stock_quantity; end if;

  insert into accessory_sales (accessory_id, client_id, quantity, unit_price, total, payment_method, seller_id, stock_after)
  values (p_accessory_id, p_client_id, p_quantity, a.sale_price, a.sale_price * p_quantity,
          p_payment_method, auth.uid(), a.stock_quantity - p_quantity)
  returning id into sale_id;

  update accessories
     set stock_quantity = stock_quantity - p_quantity,
         sold_quantity  = sold_quantity + p_quantity
   where id = p_accessory_id;

  insert into cash_transactions (type, source_type, reference_id, amount, performed_by, description)
  values ('accessory_sale', case when a.category = 'phone' then 'phone_sale' else 'accessory_sale' end,
          sale_id, a.sale_price * p_quantity, auth.uid(),
          a.name || case when p_quantity > 1 then ' × ' || p_quantity else '' end)
  returning id into ct_id;

  return sale_id;
end $$;

--
-- Name: set_client_fidele(uuid, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_client_fidele(p_client uuid, p_mode text, p_percent numeric DEFAULT NULL::numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare th integer; dflt numeric;
begin
  if get_my_role() not in ('admin','super_admin','comptoir') then raise exception 'not allowed'; end if;
  if p_percent is not null and (p_percent < 0 or p_percent > 100) then raise exception 'bad percent'; end if;
  select coalesce((select value::integer from app_settings where key = 'fidele_threshold'), 3) into th;
  select coalesce((select value::numeric from app_settings where key = 'fidele_percent'), 10) into dflt;
  if p_mode = 'fidele' then
    update clients set is_fidele = true, fidele_set_manually = true,
           fidele_percent = coalesce(p_percent, fidele_percent, dflt) where id = p_client;
  elsif p_mode = 'normal' then
    update clients set is_fidele = false, fidele_set_manually = true where id = p_client;
  elsif p_mode = 'auto' then
    update clients set fidele_set_manually = false, is_fidele = (visits_count >= th), fidele_percent = dflt where id = p_client;
  elsif p_mode = 'percent' then
    update clients set fidele_percent = p_percent where id = p_client;
  else raise exception 'bad mode'; end if;
end $$;

--
-- Name: set_my_lang(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_my_lang(p_lang text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_lang not in ('fr','en','ar') then return; end if;
  update profiles set lang = p_lang where id = auth.uid();
end $$;

--
-- Name: set_order_discount(uuid, boolean, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_order_discount(p_order uuid, p_apply boolean, p_percent numeric DEFAULT NULL::numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare o repair_orders; c clients; v_role text := get_my_role(); pct numeric;
begin
  select * into o from repair_orders where id = p_order;
  if not found then raise exception 'order not found'; end if;
  if o.status in ('delivered','cancelled') then raise exception 'order is closed'; end if;
  if not (v_role in ('admin','super_admin','comptoir')
          or (v_role = 'technicien' and o.technician_id = auth.uid())) then
    raise exception 'not allowed';
  end if;
  select * into c from clients where id = o.client_id;
  if p_apply and not coalesce(c.is_fidele, false) then raise exception 'client is not fidele'; end if;
  pct := case when p_apply then coalesce(p_percent, c.fidele_percent, 10) else 0 end;
  if pct < 0 or pct > 100 then raise exception 'bad percent'; end if;
  update repair_orders
     set discount_percent = pct,
         discount_decision = case when p_apply then 'applied' else 'declined' end,
         discount_decided_by = auth.uid()
   where id = p_order;
end $$;

--
-- Name: sync_approved_general_expense(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_approved_general_expense() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.is_approved = true and coalesce(old.is_approved, false) = false then
    insert into admin_expenses (category, description, amount, source, linked_general_expense_id)
    values (coalesce(new.category, 'أخرى'), new.description, new.amount, 'general_expense', new.id);

    insert into cash_transactions (type, source_type, reference_id, amount, performed_by, description)
    values ('expense_out', 'general', new.id, new.amount, new.approved_by, new.description);
  end if;
  return new;
end;
$$;

--
-- Name: sync_approved_repair_expense(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_approved_repair_expense() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  order_no text;
begin
  if new.is_approved = true and coalesce(old.is_approved, false) = false then
    select order_number into order_no from repair_orders where id = new.repair_order_id;

    insert into admin_expenses (category, description, amount, source, linked_repair_expense_id)
    values ('مصروف قطع غيار', new.item_name,
            new.purchase_price * new.quantity, 'technician_sync', new.id);

    insert into cash_transactions (type, source_type, reference_id, amount, performed_by, description)
    values ('expense_out', 'repair_part', new.id,
            new.purchase_price * new.quantity, new.approved_by,
            new.item_name || coalesce(' (' || order_no || ')', ''));
  end if;
  return new;
end;
$$;

--
-- Name: touch_price_guide(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_price_guide() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end $$;

--
-- Name: track_order(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.track_order(p_token text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r record; v_remaining numeric; v_payment text;
begin
  select o.id, o.order_number, o.device_model, o.status, o.final_price, o.discount, o.discount_percent,
         o.created_at, o.ready_at, o.delivered_at, o.claim_deadline, o.claim_window_hours,
         o.client_acknowledged, o.client_pickup_eta,
         split_part(coalesce(c.full_name, ''), ' ', 1) as first_name
    into r from repair_orders o left join clients c on c.id = o.client_id
   where o.access_token = p_token;
  if not found then return null; end if;

  -- the link closes 48h (claim_window_hours) after delivery
  if r.status = 'delivered'
     and coalesce(r.claim_deadline, r.delivered_at + make_interval(hours => coalesce(r.claim_window_hours, 48))) < now() then
    return jsonb_build_object('closed', true, 'order_number', r.order_number);
  end if;

  select d.amount - d.paid_amount into v_remaining from debts d
   where d.repair_order_id = r.id and d.kind = 'client_unpaid' order by d.created_at desc limit 1;

  v_payment := case when r.status <> 'delivered' then 'pending'
                    when coalesce(v_remaining, 0) > 0 then 'partial' else 'paid' end;

  -- still no phone number, no internal notes, no technician, no expenses, no estimate range
  return jsonb_build_object(
    'order_number', r.order_number, 'device_model', r.device_model, 'status', r.status,
    'final_price', r.final_price,
    'discount', coalesce(r.discount, 0), 'discount_percent', coalesce(r.discount_percent, 0),
    'total', case when r.final_price is not null then r.final_price - coalesce(r.discount, 0) end,
    'payment', v_payment,
    'remaining', case when coalesce(v_remaining, 0) > 0 then v_remaining end,
    'created_at', r.created_at, 'ready_at', r.ready_at, 'delivered_at', r.delivered_at,
    'claim_deadline', coalesce(r.claim_deadline, r.delivered_at + make_interval(hours => coalesce(r.claim_window_hours, 48))),
    'claim_window_hours', r.claim_window_hours,
    'client_acknowledged', r.client_acknowledged, 'client_pickup_eta', r.client_pickup_eta,
    'first_name', r.first_name);
end $$;

--
-- Name: update_client_visit_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_client_visit_stats() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare th integer; pct numeric;
begin
  select coalesce((select value::integer from app_settings where key = 'fidele_threshold'), 3) into th;
  select coalesce((select value::numeric from app_settings where key = 'fidele_percent'), 10) into pct;
  update clients set visits_count = visits_count + 1 where id = new.client_id;
  update clients set is_fidele = true, fidele_percent = pct
   where id = new.client_id and visits_count >= th and fidele_set_manually = false and is_fidele = false;
  return new;
end $$;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accessories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accessories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'accessory'::text,
    image_url text,
    purchase_price numeric NOT NULL,
    sale_price numeric NOT NULL,
    stock_quantity integer DEFAULT 0 NOT NULL,
    sold_quantity integer DEFAULT 0 NOT NULL,
    low_stock_threshold integer DEFAULT 3,
    supplier text,
    is_deleted boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT accessories_category_check CHECK ((category = ANY (ARRAY['accessory'::text, 'phone'::text])))
);

--
-- Name: accessory_sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accessory_sales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    accessory_id uuid,
    client_id uuid,
    quantity integer NOT NULL,
    unit_price numeric NOT NULL,
    total numeric NOT NULL,
    payment_method text,
    seller_id uuid,
    stock_after integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action text NOT NULL,
    table_name text,
    record_id uuid,
    details jsonb,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: admin_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    description text,
    amount numeric NOT NULL,
    source text DEFAULT 'manual'::text,
    linked_repair_expense_id uuid,
    linked_general_expense_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT admin_expenses_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'technician_sync'::text, 'general_expense'::text, 'general_sync'::text])))
);

--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value text NOT NULL
);

--
-- Name: cash_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    reference_id uuid,
    amount numeric NOT NULL,
    performed_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    source_type text,
    description text,
    is_void boolean DEFAULT false,
    void_reason text,
    voided_by uuid,
    CONSTRAINT cash_transactions_source_type_check CHECK (((source_type IS NULL) OR (source_type = ANY (ARRAY['repair_part'::text, 'general'::text, 'repair_income'::text, 'accessory_sale'::text, 'phone_sale'::text, 'debt_collection'::text, 'debt_payment'::text, 'loan_out'::text, 'loan_return'::text])))),
    CONSTRAINT cash_transactions_type_check CHECK ((type = ANY (ARRAY['repair_income'::text, 'accessory_sale'::text, 'expense_out'::text, 'withdrawal'::text, 'debt_collection'::text, 'loan_return'::text])))
);

--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    phone text NOT NULL,
    notes text,
    is_fidele boolean DEFAULT false,
    fidele_set_manually boolean DEFAULT false,
    total_paid numeric DEFAULT 0,
    visits_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    fidele_percent numeric DEFAULT 10 NOT NULL
);

--
-- Name: debt_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.debt_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    debt_id uuid NOT NULL,
    amount numeric NOT NULL,
    from_register boolean DEFAULT false,
    note text,
    cash_transaction_id uuid,
    is_void boolean DEFAULT false,
    received_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT debt_payments_amount_check CHECK ((amount > (0)::numeric))
);

--
-- Name: debts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.debts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    party_name text NOT NULL,
    client_id uuid,
    repair_order_id uuid,
    description text NOT NULL,
    amount numeric NOT NULL,
    paid_amount numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    due_date date,
    from_register boolean DEFAULT false NOT NULL,
    created_by uuid DEFAULT auth.uid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    settled_at timestamp with time zone,
    CONSTRAINT debts_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT debts_kind_check CHECK ((kind = ANY (ARRAY['client_unpaid'::text, 'supplier_unpaid'::text, 'money_lent'::text]))),
    CONSTRAINT debts_party_name_check CHECK ((char_length(TRIM(BOTH FROM party_name)) > 0)),
    CONSTRAINT debts_status_check CHECK ((status = ANY (ARRAY['open'::text, 'settled'::text])))
);

--
-- Name: general_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.general_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    spent_by uuid NOT NULL,
    amount numeric NOT NULL,
    description text NOT NULL,
    category text DEFAULT 'أخرى'::text,
    created_at timestamp with time zone DEFAULT now(),
    is_approved boolean DEFAULT false,
    approved_by uuid,
    CONSTRAINT general_expenses_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT general_expenses_reason_check CHECK ((char_length(TRIM(BOTH FROM description)) > 0))
);

--
-- Name: notif_phrases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notif_phrases (
    ar text NOT NULL,
    fr text NOT NULL,
    en text NOT NULL
);

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_id uuid,
    recipient_role text,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    related_order_id uuid,
    related_general_expense_id uuid,
    link_path text,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    title_fr text,
    message_fr text,
    title_en text,
    message_en text,
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['new_order'::text, 'status_change'::text, 'client_ack'::text, 'expense_added'::text, 'low_stock'::text, 'void_request'::text, 'debt_added'::text, 'order_assigned'::text, 'order_unassigned'::text, 'order_ready'::text, 'order_cancelled'::text, 'price_set'::text, 'void_result'::text, 'expense_result'::text, 'fidele'::text, 'fidele_order'::text, 'discount_applied'::text, 'big_sale'::text, 'cash_withdrawal'::text, 'debt_settled'::text, 'debt_payment'::text, 'debt_due'::text, 'pending_digest'::text, 'stuck_orders'::text, 'ready_waiting'::text, 'daily_summary'::text, 'test'::text])))
);

--
-- Name: part_price_guide; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.part_price_guide (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    device_model text NOT NULL,
    part_type text NOT NULL,
    quality_label text NOT NULL,
    notes text,
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    price_min numeric,
    price_max numeric,
    CONSTRAINT part_price_guide_device_model_check CHECK ((char_length(TRIM(BOTH FROM device_model)) > 0)),
    CONSTRAINT part_price_guide_part_type_check CHECK ((char_length(TRIM(BOTH FROM part_type)) > 0)),
    CONSTRAINT part_price_guide_price_check CHECK (((price_min > (0)::numeric) AND ((price_max IS NULL) OR (price_max >= price_min)))),
    CONSTRAINT part_price_guide_quality_label_check CHECK ((char_length(TRIM(BOTH FROM quality_label)) > 0))
);

--
-- Name: phone_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phone_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    accessory_id uuid NOT NULL,
    imei text,
    condition text,
    battery_health integer,
    internal_warranty_days integer DEFAULT 0,
    source_type text,
    source_details text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT phone_details_condition_check CHECK ((condition = ANY (ARRAY['new'::text, 'used'::text]))),
    CONSTRAINT phone_details_source_type_check CHECK ((source_type = ANY (ARRAY['supplier'::text, 'client_trade_in'::text])))
);

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    role text NOT NULL,
    phone text,
    created_at timestamp with time zone DEFAULT now(),
    lang text DEFAULT 'fr'::text NOT NULL,
    CONSTRAINT profiles_lang_check CHECK ((lang = ANY (ARRAY['fr'::text, 'en'::text, 'ar'::text]))),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'comptoir'::text, 'technicien'::text, 'super_admin'::text])))
);

--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: repair_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.repair_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    repair_order_id uuid,
    technician_id uuid,
    item_name text NOT NULL,
    supplier text,
    purchase_price numeric NOT NULL,
    quantity integer DEFAULT 1,
    is_approved boolean DEFAULT false,
    approved_by uuid,
    affects_stock boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    spent_by uuid
);

--
-- Name: repair_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.repair_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_number text NOT NULL,
    client_id uuid,
    device_model text NOT NULL,
    issue_description text NOT NULL,
    status text DEFAULT 'received'::text NOT NULL,
    price_min numeric,
    price_max numeric,
    final_price numeric,
    discount numeric DEFAULT 0,
    payment_method text,
    is_paid boolean DEFAULT false,
    technician_id uuid,
    comptoir_id uuid,
    delivered_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    ready_at timestamp with time zone,
    delivered_at timestamp with time zone,
    claim_window_hours integer DEFAULT 48,
    claim_deadline timestamp with time zone,
    is_claim_used boolean DEFAULT false,
    access_token text DEFAULT encode(extensions.gen_random_bytes(8), 'hex'::text),
    client_acknowledged boolean DEFAULT false,
    client_acknowledged_at timestamp with time zone,
    client_pickup_eta timestamp with time zone,
    price_confirmed boolean DEFAULT false,
    unpaid_amount numeric DEFAULT 0,
    discount_percent numeric DEFAULT 0 NOT NULL,
    discount_decision text,
    discount_decided_by uuid,
    CONSTRAINT repair_orders_discount_decision_check CHECK ((discount_decision = ANY (ARRAY['applied'::text, 'declined'::text]))),
    CONSTRAINT repair_orders_discount_percent_check CHECK (((discount_percent >= (0)::numeric) AND (discount_percent <= (100)::numeric))),
    CONSTRAINT repair_orders_status_check CHECK ((status = ANY (ARRAY['received'::text, 'diagnosing'::text, 'in_repair'::text, 'ready'::text, 'delivered'::text, 'cancelled'::text])))
);

--
-- Name: void_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.void_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cash_transaction_id uuid NOT NULL,
    reason text NOT NULL,
    requested_by uuid DEFAULT auth.uid() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    review_note text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT void_requests_reason_check CHECK ((char_length(TRIM(BOTH FROM reason)) >= 3)),
    CONSTRAINT void_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);

--
-- Name: accessories accessories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accessories
    ADD CONSTRAINT accessories_pkey PRIMARY KEY (id);

--
-- Name: accessory_sales accessory_sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accessory_sales
    ADD CONSTRAINT accessory_sales_pkey PRIMARY KEY (id);

--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);

--
-- Name: admin_expenses admin_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_expenses
    ADD CONSTRAINT admin_expenses_pkey PRIMARY KEY (id);

--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);

--
-- Name: cash_transactions cash_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_transactions
    ADD CONSTRAINT cash_transactions_pkey PRIMARY KEY (id);

--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);

--
-- Name: debt_payments debt_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_payments
    ADD CONSTRAINT debt_payments_pkey PRIMARY KEY (id);

--
-- Name: debts debts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_pkey PRIMARY KEY (id);

--
-- Name: general_expenses general_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.general_expenses
    ADD CONSTRAINT general_expenses_pkey PRIMARY KEY (id);

--
-- Name: notif_phrases notif_phrases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notif_phrases
    ADD CONSTRAINT notif_phrases_pkey PRIMARY KEY (ar);

--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

--
-- Name: part_price_guide part_price_guide_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.part_price_guide
    ADD CONSTRAINT part_price_guide_pkey PRIMARY KEY (id);

--
-- Name: phone_details phone_details_accessory_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_details
    ADD CONSTRAINT phone_details_accessory_id_key UNIQUE (accessory_id);

--
-- Name: phone_details phone_details_imei_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_details
    ADD CONSTRAINT phone_details_imei_key UNIQUE (imei);

--
-- Name: phone_details phone_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_details
    ADD CONSTRAINT phone_details_pkey PRIMARY KEY (id);

--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);

--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);

--
-- Name: repair_expenses repair_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_expenses
    ADD CONSTRAINT repair_expenses_pkey PRIMARY KEY (id);

--
-- Name: repair_orders repair_orders_access_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_orders
    ADD CONSTRAINT repair_orders_access_token_key UNIQUE (access_token);

--
-- Name: repair_orders repair_orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_orders
    ADD CONSTRAINT repair_orders_order_number_key UNIQUE (order_number);

--
-- Name: repair_orders repair_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_orders
    ADD CONSTRAINT repair_orders_pkey PRIMARY KEY (id);

--
-- Name: void_requests void_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.void_requests
    ADD CONSTRAINT void_requests_pkey PRIMARY KEY (id);

--
-- Name: idx_ppg_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppg_model ON public.part_price_guide USING btree (lower(device_model));

--
-- Name: idx_ppg_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppg_type ON public.part_price_guide USING btree (part_type);

--
-- Name: notif_recipient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notif_recipient_idx ON public.notifications USING btree (recipient_id, created_at DESC);

--
-- Name: notif_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notif_role_idx ON public.notifications USING btree (recipient_role, created_at DESC);

--
-- Name: one_pending_void_per_tx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX one_pending_void_per_tx ON public.void_requests USING btree (cash_transaction_id) WHERE (status = 'pending'::text);

--
-- Name: repair_orders trg_apply_discount_percent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_apply_discount_percent BEFORE INSERT OR UPDATE OF final_price, discount_percent ON public.repair_orders FOR EACH ROW EXECUTE FUNCTION public.apply_discount_percent();

--
-- Name: repair_orders trg_compute_claim_deadline; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_compute_claim_deadline BEFORE INSERT OR UPDATE ON public.repair_orders FOR EACH ROW EXECUTE FUNCTION public.compute_claim_deadline();

--
-- Name: repair_orders trg_guard_technicien_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_technicien_status BEFORE UPDATE ON public.repair_orders FOR EACH ROW EXECUTE FUNCTION public.guard_technicien_status();

--
-- Name: debts trg_log_loan_out; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_loan_out AFTER INSERT ON public.debts FOR EACH ROW EXECUTE FUNCTION public.log_loan_out();

--
-- Name: repair_orders trg_log_repair_income; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_repair_income AFTER UPDATE ON public.repair_orders FOR EACH ROW EXECUTE FUNCTION public.log_repair_income();

--
-- Name: notifications trg_notifications_translate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notifications_translate BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.notifications_translate();

--
-- Name: accessory_sales trg_notify_big_sale; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_big_sale AFTER INSERT ON public.accessory_sales FOR EACH ROW EXECUTE FUNCTION public.notify_big_sale();

--
-- Name: cash_transactions trg_notify_cash_withdrawal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_cash_withdrawal AFTER INSERT ON public.cash_transactions FOR EACH ROW EXECUTE FUNCTION public.notify_cash_withdrawal();

--
-- Name: debts trg_notify_debt_added; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_debt_added AFTER INSERT ON public.debts FOR EACH ROW EXECUTE FUNCTION public.notify_debt_added();

--
-- Name: debt_payments trg_notify_debt_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_debt_payment AFTER INSERT ON public.debt_payments FOR EACH ROW EXECUTE FUNCTION public.notify_debt_payment();

--
-- Name: debts trg_notify_debt_settled; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_debt_settled AFTER UPDATE OF status ON public.debts FOR EACH ROW EXECUTE FUNCTION public.notify_debt_settled();

--
-- Name: repair_orders trg_notify_discount_decision; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_discount_decision AFTER UPDATE OF discount_decision ON public.repair_orders FOR EACH ROW EXECUTE FUNCTION public.notify_discount_decision();

--
-- Name: general_expenses trg_notify_expense_result; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_expense_result AFTER UPDATE OF is_approved ON public.general_expenses FOR EACH ROW EXECUTE FUNCTION public.notify_expense_result();

--
-- Name: clients trg_notify_fidele; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_fidele AFTER UPDATE OF is_fidele ON public.clients FOR EACH ROW EXECUTE FUNCTION public.notify_fidele();

--
-- Name: repair_orders trg_notify_fidele_order; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_fidele_order AFTER INSERT ON public.repair_orders FOR EACH ROW WHEN ((new.client_id IS NOT NULL)) EXECUTE FUNCTION public.notify_fidele_order();

--
-- Name: general_expenses trg_notify_general_expense; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_general_expense AFTER INSERT ON public.general_expenses FOR EACH ROW EXECUTE FUNCTION public.notify_general_expense_pending();

--
-- Name: accessories trg_notify_low_stock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_low_stock AFTER UPDATE OF stock_quantity ON public.accessories FOR EACH ROW EXECUTE FUNCTION public.notify_low_stock();

--
-- Name: repair_orders trg_notify_order_assigned; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_order_assigned AFTER INSERT OR UPDATE OF technician_id ON public.repair_orders FOR EACH ROW EXECUTE FUNCTION public.notify_order_assigned();

--
-- Name: repair_orders trg_notify_price_set; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_price_set AFTER UPDATE OF final_price ON public.repair_orders FOR EACH ROW EXECUTE FUNCTION public.notify_price_set();

--
-- Name: repair_expenses trg_notify_repair_expense; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_repair_expense AFTER INSERT ON public.repair_expenses FOR EACH ROW EXECUTE FUNCTION public.notify_repair_expense_pending();

--
-- Name: repair_expenses trg_notify_repair_expense_result; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_repair_expense_result AFTER UPDATE OF is_approved ON public.repair_expenses FOR EACH ROW EXECUTE FUNCTION public.notify_repair_expense_result();

--
-- Name: repair_orders trg_notify_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_status_change AFTER UPDATE OF status ON public.repair_orders FOR EACH ROW EXECUTE FUNCTION public.notify_status_change();

--
-- Name: void_requests trg_notify_void_request; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_void_request AFTER INSERT ON public.void_requests FOR EACH ROW EXECUTE FUNCTION public.notify_void_request();

--
-- Name: void_requests trg_notify_void_result; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_void_result AFTER UPDATE OF status ON public.void_requests FOR EACH ROW EXECUTE FUNCTION public.notify_void_result();

--
-- Name: repair_orders trg_reset_price_confirmation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reset_price_confirmation BEFORE UPDATE ON public.repair_orders FOR EACH ROW EXECUTE FUNCTION public.reset_price_confirmation();

--
-- Name: cash_transactions trg_restock_on_void; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_restock_on_void AFTER UPDATE ON public.cash_transactions FOR EACH ROW EXECUTE FUNCTION public.restock_on_void();

--
-- Name: general_expenses trg_sync_general_approved; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_general_approved AFTER UPDATE ON public.general_expenses FOR EACH ROW EXECUTE FUNCTION public.sync_approved_general_expense();

--
-- Name: repair_expenses trg_sync_repair_expense; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_repair_expense AFTER UPDATE ON public.repair_expenses FOR EACH ROW EXECUTE FUNCTION public.sync_approved_repair_expense();

--
-- Name: part_price_guide trg_touch_price_guide; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch_price_guide BEFORE INSERT OR UPDATE ON public.part_price_guide FOR EACH ROW EXECUTE FUNCTION public.touch_price_guide();

--
-- Name: accessory_sales trg_visit_on_accessory_sale; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_visit_on_accessory_sale AFTER INSERT ON public.accessory_sales FOR EACH ROW WHEN ((new.client_id IS NOT NULL)) EXECUTE FUNCTION public.update_client_visit_stats();

--
-- Name: repair_orders trg_visit_on_repair; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_visit_on_repair AFTER INSERT ON public.repair_orders FOR EACH ROW WHEN ((new.client_id IS NOT NULL)) EXECUTE FUNCTION public.update_client_visit_stats();

--
-- Name: accessory_sales accessory_sales_accessory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accessory_sales
    ADD CONSTRAINT accessory_sales_accessory_id_fkey FOREIGN KEY (accessory_id) REFERENCES public.accessories(id);

--
-- Name: accessory_sales accessory_sales_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accessory_sales
    ADD CONSTRAINT accessory_sales_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);

--
-- Name: accessory_sales accessory_sales_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accessory_sales
    ADD CONSTRAINT accessory_sales_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.profiles(id);

--
-- Name: activity_log activity_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);

--
-- Name: admin_expenses admin_expenses_linked_repair_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_expenses
    ADD CONSTRAINT admin_expenses_linked_repair_expense_id_fkey FOREIGN KEY (linked_repair_expense_id) REFERENCES public.repair_expenses(id);

--
-- Name: cash_transactions cash_transactions_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_transactions
    ADD CONSTRAINT cash_transactions_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.profiles(id);

--
-- Name: cash_transactions cash_transactions_voided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_transactions
    ADD CONSTRAINT cash_transactions_voided_by_fkey FOREIGN KEY (voided_by) REFERENCES public.profiles(id);

--
-- Name: debt_payments debt_payments_cash_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_payments
    ADD CONSTRAINT debt_payments_cash_transaction_id_fkey FOREIGN KEY (cash_transaction_id) REFERENCES public.cash_transactions(id);

--
-- Name: debt_payments debt_payments_debt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_payments
    ADD CONSTRAINT debt_payments_debt_id_fkey FOREIGN KEY (debt_id) REFERENCES public.debts(id);

--
-- Name: debt_payments debt_payments_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_payments
    ADD CONSTRAINT debt_payments_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.profiles(id);

--
-- Name: debts debts_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);

--
-- Name: debts debts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);

--
-- Name: debts debts_repair_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_repair_order_id_fkey FOREIGN KEY (repair_order_id) REFERENCES public.repair_orders(id);

--
-- Name: admin_expenses fk_general_expense; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_expenses
    ADD CONSTRAINT fk_general_expense FOREIGN KEY (linked_general_expense_id) REFERENCES public.general_expenses(id);

--
-- Name: general_expenses general_expenses_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.general_expenses
    ADD CONSTRAINT general_expenses_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);

--
-- Name: general_expenses general_expenses_spent_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.general_expenses
    ADD CONSTRAINT general_expenses_spent_by_fkey FOREIGN KEY (spent_by) REFERENCES public.profiles(id);

--
-- Name: notifications notifications_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id);

--
-- Name: notifications notifications_related_general_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_related_general_expense_id_fkey FOREIGN KEY (related_general_expense_id) REFERENCES public.general_expenses(id);

--
-- Name: notifications notifications_related_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_related_order_id_fkey FOREIGN KEY (related_order_id) REFERENCES public.repair_orders(id);

--
-- Name: part_price_guide part_price_guide_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.part_price_guide
    ADD CONSTRAINT part_price_guide_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);

--
-- Name: part_price_guide part_price_guide_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.part_price_guide
    ADD CONSTRAINT part_price_guide_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);

--
-- Name: phone_details phone_details_accessory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_details
    ADD CONSTRAINT phone_details_accessory_id_fkey FOREIGN KEY (accessory_id) REFERENCES public.accessories(id);

--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: repair_expenses repair_expenses_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_expenses
    ADD CONSTRAINT repair_expenses_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);

--
-- Name: repair_expenses repair_expenses_repair_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_expenses
    ADD CONSTRAINT repair_expenses_repair_order_id_fkey FOREIGN KEY (repair_order_id) REFERENCES public.repair_orders(id);

--
-- Name: repair_expenses repair_expenses_spent_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_expenses
    ADD CONSTRAINT repair_expenses_spent_by_fkey FOREIGN KEY (spent_by) REFERENCES public.profiles(id);

--
-- Name: repair_expenses repair_expenses_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_expenses
    ADD CONSTRAINT repair_expenses_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.profiles(id);

--
-- Name: repair_orders repair_orders_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_orders
    ADD CONSTRAINT repair_orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);

--
-- Name: repair_orders repair_orders_comptoir_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_orders
    ADD CONSTRAINT repair_orders_comptoir_id_fkey FOREIGN KEY (comptoir_id) REFERENCES public.profiles(id);

--
-- Name: repair_orders repair_orders_delivered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_orders
    ADD CONSTRAINT repair_orders_delivered_by_fkey FOREIGN KEY (delivered_by) REFERENCES public.profiles(id);

--
-- Name: repair_orders repair_orders_discount_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_orders
    ADD CONSTRAINT repair_orders_discount_decided_by_fkey FOREIGN KEY (discount_decided_by) REFERENCES public.profiles(id);

--
-- Name: repair_orders repair_orders_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_orders
    ADD CONSTRAINT repair_orders_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.profiles(id);

--
-- Name: void_requests void_requests_cash_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.void_requests
    ADD CONSTRAINT void_requests_cash_transaction_id_fkey FOREIGN KEY (cash_transaction_id) REFERENCES public.cash_transactions(id);

--
-- Name: void_requests void_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.void_requests
    ADD CONSTRAINT void_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.profiles(id);

--
-- Name: void_requests void_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.void_requests
    ADD CONSTRAINT void_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);

--
-- Name: accessories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accessories ENABLE ROW LEVEL SECURITY;

--
-- Name: accessory_sales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accessory_sales ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: debts add debts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "add debts" ON public.debts FOR INSERT WITH CHECK (((created_by = auth.uid()) AND ((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])) OR ((public.get_my_role() = 'comptoir'::text) AND (kind = 'client_unpaid'::text)))));

--
-- Name: repair_expenses admin approves expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin approves expenses" ON public.repair_expenses FOR UPDATE USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

--
-- Name: general_expenses admin approves general expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin approves general expenses" ON public.general_expenses FOR UPDATE USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

--
-- Name: app_settings admin edits settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin edits settings" ON public.app_settings USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text]))) WITH CHECK ((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

--
-- Name: admin_expenses admin inserts manual expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin inserts manual expenses" ON public.admin_expenses FOR INSERT WITH CHECK ((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

--
-- Name: repair_orders admin inserts repair orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin inserts repair orders" ON public.repair_orders FOR INSERT WITH CHECK ((public.get_my_role() = 'admin'::text));

--
-- Name: accessories admin manages accessories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin manages accessories" ON public.accessories FOR INSERT WITH CHECK ((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

--
-- Name: admin_expenses admin manages expenses ledger; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin manages expenses ledger" ON public.admin_expenses FOR SELECT USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

--
-- Name: phone_details admin manages phone details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin manages phone details" ON public.phone_details USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text]))) WITH CHECK ((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

--
-- Name: activity_log admin reads activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin reads activity" ON public.activity_log FOR SELECT USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

--
-- Name: repair_orders admin selects repair orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin selects repair orders" ON public.repair_orders FOR SELECT USING ((public.get_my_role() = 'admin'::text));

--
-- Name: accessories admin updates accessories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin updates accessories" ON public.accessories FOR UPDATE USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

--
-- Name: repair_orders admin updates repair orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin updates repair orders" ON public.repair_orders FOR UPDATE USING ((public.get_my_role() = 'admin'::text));

--
-- Name: admin_expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: cash_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: repair_orders comptoir and admin create orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comptoir and admin create orders" ON public.repair_orders FOR INSERT WITH CHECK ((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'comptoir'::text])));

--
-- Name: clients comptoir creates clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comptoir creates clients" ON public.clients FOR INSERT WITH CHECK ((public.get_my_role() = ANY (ARRAY['admin'::text, 'comptoir'::text])));

--
-- Name: clients comptoir updates client info; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comptoir updates client info" ON public.clients FOR UPDATE USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'comptoir'::text])));

--
-- Name: profiles comptoir views technicians; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comptoir views technicians" ON public.profiles FOR SELECT USING (((auth.uid() = id) OR (public.get_my_role() = 'admin'::text) OR ((public.get_my_role() = 'comptoir'::text) AND (role = 'technicien'::text))));

--
-- Name: debt_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: debts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

--
-- Name: general_expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.general_expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications mark my notifications read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mark my notifications read" ON public.notifications FOR UPDATE TO authenticated USING (((recipient_id = auth.uid()) OR ((recipient_role IS NOT NULL) AND ((recipient_role = public.get_my_role()) OR ((recipient_role = 'admin'::text) AND (public.get_my_role() = 'super_admin'::text)))))) WITH CHECK (true);

--
-- Name: notif_phrases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notif_phrases ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions own push subs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own push subs" ON public.push_subscriptions FOR SELECT TO authenticated USING ((user_id = auth.uid()));

--
-- Name: part_price_guide; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.part_price_guide ENABLE ROW LEVEL SECURITY;

--
-- Name: phone_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.phone_details ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications read my notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read my notifications" ON public.notifications FOR SELECT TO authenticated USING (((recipient_id = auth.uid()) OR ((recipient_role IS NOT NULL) AND ((recipient_role = public.get_my_role()) OR ((recipient_role = 'admin'::text) AND (public.get_my_role() = 'super_admin'::text))))));

--
-- Name: app_settings read settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read settings" ON public.app_settings FOR SELECT TO authenticated USING (true);

--
-- Name: repair_expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.repair_expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: repair_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.repair_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: repair_expenses staff creates repair expense; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff creates repair expense" ON public.repair_expenses FOR INSERT WITH CHECK (((public.get_my_role() = ANY (ARRAY['technicien'::text, 'comptoir'::text, 'admin'::text, 'super_admin'::text])) AND (spent_by = auth.uid())));

--
-- Name: part_price_guide staff edit price guide; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff edit price guide" ON public.part_price_guide USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'technicien'::text]))) WITH CHECK ((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'technicien'::text])));

--
-- Name: void_requests staff requests void; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff requests void" ON public.void_requests FOR INSERT WITH CHECK (((requested_by = auth.uid()) AND (public.get_my_role() = ANY (ARRAY['comptoir'::text, 'admin'::text, 'super_admin'::text]))));

--
-- Name: repair_orders update repair orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "update repair orders" ON public.repair_orders FOR UPDATE USING (((public.get_my_role() = ANY (ARRAY['admin'::text, 'comptoir'::text])) OR (technician_id = auth.uid())));

--
-- Name: general_expenses user creates own general expense; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user creates own general expense" ON public.general_expenses FOR INSERT WITH CHECK ((spent_by = auth.uid()));

--
-- Name: accessories view accessories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view accessories" ON public.accessories FOR SELECT USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'comptoir'::text, 'technicien'::text])));

--
-- Name: accessory_sales view accessory sales; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view accessory sales" ON public.accessory_sales FOR SELECT USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'comptoir'::text])));

--
-- Name: cash_transactions view cash transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view cash transactions" ON public.cash_transactions FOR SELECT USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'comptoir'::text])));

--
-- Name: clients view clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view clients" ON public.clients FOR SELECT USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'comptoir'::text, 'technicien'::text])));

--
-- Name: debt_payments view debt payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view debt payments" ON public.debt_payments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.debts d
  WHERE (d.id = debt_payments.debt_id))));

--
-- Name: debts view debts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view debts" ON public.debts FOR SELECT USING (((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])) OR ((public.get_my_role() = 'comptoir'::text) AND (kind = 'client_unpaid'::text))));

--
-- Name: general_expenses view general expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view general expenses" ON public.general_expenses FOR SELECT USING (((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])) OR (spent_by = auth.uid())));

--
-- Name: phone_details view phone details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view phone details" ON public.phone_details FOR SELECT USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'comptoir'::text, 'technicien'::text])));

--
-- Name: part_price_guide view price guide; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view price guide" ON public.part_price_guide FOR SELECT USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'comptoir'::text, 'technicien'::text])));

--
-- Name: repair_expenses view repair expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view repair expenses" ON public.repair_expenses FOR SELECT USING (((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])) OR (spent_by = auth.uid())));

--
-- Name: repair_orders view repair orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view repair orders" ON public.repair_orders FOR SELECT USING (((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'comptoir'::text])) OR (technician_id = auth.uid())));

--
-- Name: void_requests view void requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view void requests" ON public.void_requests FOR SELECT USING (((public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])) OR (requested_by = auth.uid())));

--
-- Name: void_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.void_requests ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

-- 3 ---------------------------------------------------------------- new login => profile row
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4 ---------------------------------------------------------------- permissions
revoke all on function public.track_order(text) from public;
revoke all on function public.acknowledge_order(text, timestamptz) from public;
grant execute on function public.track_order(text) to anon, authenticated;
grant execute on function public.acknowledge_order(text, timestamptz) to anon, authenticated;
grant execute on function public.get_my_role() to authenticated;
grant execute on function public.set_client_fidele(uuid, text, numeric) to authenticated;
grant execute on function public.set_order_discount(uuid, boolean, numeric) to authenticated;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
revoke all on function public.set_my_lang(text) from public;
grant execute on function public.set_my_lang(text) to authenticated;
revoke update on public.notifications from authenticated;
grant update (is_read) on public.notifications to authenticated;      -- people can only flip is_read

-- 5 ---------------------------------------------------------------- live updates (the bell)
do $$ begin alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;

-- 6 ---------------------------------------------------------------- photo bucket rules
-- (the bucket "product-images" must exist and be public — see the top of this file)
drop policy if exists "public read product images" on storage.objects;
drop policy if exists "admin uploads product images" on storage.objects;
drop policy if exists "admin updates product images" on storage.objects;
drop policy if exists "admin deletes product images" on storage.objects;
create policy "public read product images" on storage.objects
  for select using (bucket_id = 'product-images');
create policy "admin uploads product images" on storage.objects
  for insert with check (bucket_id = 'product-images' and public.get_my_role() in ('admin','super_admin'));
create policy "admin updates product images" on storage.objects
  for update using (bucket_id = 'product-images' and public.get_my_role() in ('admin','super_admin'));
create policy "admin deletes product images" on storage.objects
  for delete using (bucket_id = 'product-images' and public.get_my_role() in ('admin','super_admin'));

-- 7 ---------------------------------------------------------------- starting data
INSERT INTO public.app_settings VALUES ('fidele_threshold', '3') ON CONFLICT DO NOTHING;
INSERT INTO public.app_settings VALUES ('fidele_percent', '10') ON CONFLICT DO NOTHING;
INSERT INTO public.app_settings VALUES ('big_sale_threshold', '300') ON CONFLICT DO NOTHING;

INSERT INTO public.notif_phrases VALUES ('تم الاستلام', 'Reçu', 'Received');
INSERT INTO public.notif_phrases VALUES ('قيد الفحص', 'En cours d''examen', 'Under inspection');
INSERT INTO public.notif_phrases VALUES ('قيد الإصلاح', 'En réparation', 'Being repaired');
INSERT INTO public.notif_phrases VALUES ('جاهز للتسليم', 'Prêt à livrer', 'Ready to deliver');
INSERT INTO public.notif_phrases VALUES ('تم التسليم', 'Livré', 'Delivered');
INSERT INTO public.notif_phrases VALUES ('ملغى', 'Annulé', 'Cancelled');
INSERT INTO public.notif_phrases VALUES ('الجهاز جاهز ✅', 'L''appareil est prêt ✅', 'The device is ready ✅');
INSERT INTO public.notif_phrases VALUES ('تم إلغاء الطلب', 'Commande annulée', 'Order cancelled');
INSERT INTO public.notif_phrases VALUES ('تغيّرت حالة الطلب', 'Le statut de la commande a changé', 'The order status has changed');
INSERT INTO public.notif_phrases VALUES (' — العميل يرى الرسالة في صفحة التتبع وسيؤكد قدومه', ' — le client voit le message sur la page de suivi et confirmera sa venue', ' — the client sees the message on the tracking page and will confirm their visit');
INSERT INTO public.notif_phrases VALUES ('جهاز جديد لك', 'Nouvel appareil pour vous', 'New device for you');
INSERT INTO public.notif_phrases VALUES ('تم إسناد ', 'Assigné : ', 'Assigned: ');
INSERT INTO public.notif_phrases VALUES (' — الطلب ', ' — commande ', ' — order ');
INSERT INTO public.notif_phrases VALUES ('جهاز جديد بانتظار تقني', 'Nouvel appareil en attente d''un technicien', 'New device waiting for a technician');
INSERT INTO public.notif_phrases VALUES ('التقني حدّد السعر النهائي', 'Le technicien a fixé le prix final', 'The technician set the final price');
INSERT INTO public.notif_phrases VALUES (' — راجعه وأكّده', ' — vérifiez-le et confirmez-le', ' — check it and confirm it');
INSERT INTO public.notif_phrases VALUES ('طلب صيانة جديد', 'Nouvelle commande de réparation', 'New repair order');
INSERT INTO public.notif_phrases VALUES ('تم استقبال جهاز ', 'Appareil reçu : ', 'Device received: ');
INSERT INTO public.notif_phrases VALUES (' — رقم الطلب ', ' — commande n° ', ' — order no. ');
INSERT INTO public.notif_phrases VALUES (' أصبح: ', ' est maintenant : ', ' is now: ');
INSERT INTO public.notif_phrases VALUES ('الطلب ', 'Commande ', 'Order ');
INSERT INTO public.notif_phrases VALUES ('الحريف أكد الاستلام', 'Le client a confirmé sa venue', 'The client confirmed they will come');
INSERT INTO public.notif_phrases VALUES ('حريف الطلب ', 'Client de la commande ', 'Client of order ');
INSERT INTO public.notif_phrases VALUES (' أكد أنو عارف جهازو جاهز', ' a confirmé qu''il sait que son appareil est prêt', ' confirmed they know their device is ready');
INSERT INTO public.notif_phrases VALUES (' — رح يجي حوالي: ', ' — viendra vers : ', ' — will come around: ');
INSERT INTO public.notif_phrases VALUES (' — رح يجي: ', ' — viendra le : ', ' — will come on: ');
INSERT INTO public.notif_phrases VALUES (' الساعة ', ' à ', ' at ');
INSERT INTO public.notif_phrases VALUES (' (بدون تحديد وقت)', ' (heure non précisée)', ' (no time given)');
INSERT INTO public.notif_phrases VALUES ('تمت الموافقة على الإلغاء', 'Annulation approuvée', 'Cancellation approved');
INSERT INTO public.notif_phrases VALUES ('تم رفض طلب الإلغاء', 'Demande d''annulation refusée', 'Cancellation request refused');
INSERT INTO public.notif_phrases VALUES ('تمت الموافقة على مصروفك', 'Votre dépense a été approuvée', 'Your expense was approved');
INSERT INTO public.notif_phrases VALUES ('تمت الموافقة على مصروف القطع', 'Votre dépense de pièces a été approuvée', 'Your parts expense was approved');
INSERT INTO public.notif_phrases VALUES ('مصروف جديد بانتظار الاعتماد', 'Nouvelle dépense en attente de validation', 'New expense waiting for approval');
INSERT INTO public.notif_phrases VALUES ('مصروف قطعة غيار بانتظار الاعتماد', 'Dépense de pièce en attente de validation', 'Spare-part expense waiting for approval');
INSERT INTO public.notif_phrases VALUES ('مصروف جديد', 'Nouvelle dépense', 'New expense');
INSERT INTO public.notif_phrases VALUES (' صرف ', ' a dépensé ', ' spent ');
INSERT INTO public.notif_phrases VALUES (' سجّل ', ' a enregistré ', ' logged ');
INSERT INTO public.notif_phrases VALUES (' — السبب: ', ' — motif : ', ' — reason: ');
INSERT INTO public.notif_phrases VALUES ('طلب إلغاء عملية بانتظار الموافقة', 'Demande d''annulation d''une opération en attente', 'Operation cancellation request waiting for approval');
INSERT INTO public.notif_phrases VALUES (' يطلب إلغاء ', ' demande l''annulation de ', ' asks to cancel ');
INSERT INTO public.notif_phrases VALUES (' | السبب: ', ' | motif : ', ' | reason: ');
INSERT INTO public.notif_phrases VALUES ('نفد المخزون', 'Rupture de stock', 'Out of stock');
INSERT INTO public.notif_phrases VALUES ('المخزون على وشك النفاد', 'Stock bientôt épuisé', 'Stock running low');
INSERT INTO public.notif_phrases VALUES (' — المتبقي: ', ' — restant : ', ' — left: ');
INSERT INTO public.notif_phrases VALUES ('سحب من الصندوق', 'Retrait de la caisse', 'Cash withdrawal');
INSERT INTO public.notif_phrases VALUES (' سحب ', ' a retiré ', ' withdrew ');
INSERT INTO public.notif_phrases VALUES ('عملية بيع كبيرة', 'Grosse vente', 'Large sale');
INSERT INTO public.notif_phrases VALUES ('دين جديد على حريف', 'Nouvelle dette d''un client', 'New client debt');
INSERT INTO public.notif_phrases VALUES (' د.ت على ', ' DT pour ', ' TND for ');
INSERT INTO public.notif_phrases VALUES ('تمت تسوية دين', 'Dette réglée', 'Debt settled');
INSERT INTO public.notif_phrases VALUES ('تم استلام دفعة دين', 'Paiement de dette reçu', 'Debt payment received');
INSERT INTO public.notif_phrases VALUES ('ديون مستحقة', 'Dettes échues', 'Debts due');
INSERT INTO public.notif_phrases VALUES (' دين — المجموع ', ' dette(s) — total ', ' debt(s) — total ');
INSERT INTO public.notif_phrases VALUES ('عميل فيديل جديد ⭐', 'Nouveau client fidèle ⭐', 'New loyal client ⭐');
INSERT INTO public.notif_phrases VALUES (' — طبّق تخفيض الفيديل في الزيارة القادمة', ' — appliquez la remise fidélité à sa prochaine visite', ' — apply the loyalty discount on their next visit');
INSERT INTO public.notif_phrases VALUES ('عميل فيديل ⭐', 'Client fidèle ⭐', 'Loyal client ⭐');
INSERT INTO public.notif_phrases VALUES (' · يمكنك تطبيق التخفيض من تفاصيل الطلب', ' · vous pouvez appliquer la remise depuis les détails de la commande', ' · you can apply the discount from the order details');
INSERT INTO public.notif_phrases VALUES ('تم تطبيق تخفيض الفيديل ', 'Remise fidélité appliquée ', 'Loyalty discount applied ');
INSERT INTO public.notif_phrases VALUES ('تم رفض تخفيض الفيديل', 'Remise fidélité refusée', 'Loyalty discount declined');
INSERT INTO public.notif_phrases VALUES ('أجهزة جاهزة تنتظر العميل', 'Appareils prêts en attente du client', 'Ready devices waiting for the client');
INSERT INTO public.notif_phrases VALUES (' جهاز جاهز منذ أكثر من يومين ولم يُستلم بعد', ' appareil(s) prêt(s) depuis plus de 2 jours, pas encore récupéré(s)', ' device(s) ready for more than 2 days, not collected yet');
INSERT INTO public.notif_phrases VALUES ('طلبات بانتظار موافقتك', 'Demandes en attente de votre approbation', 'Requests waiting for your approval');
INSERT INTO public.notif_phrases VALUES (' طلب (إلغاءات + مصاريف)', ' demande(s) (annulations + dépenses)', ' request(s) (cancellations + expenses)');
INSERT INTO public.notif_phrases VALUES ('أجهزة متأخرة في الورشة', 'Appareils en retard à l''atelier', 'Late devices in the workshop');
INSERT INTO public.notif_phrases VALUES (' جهاز أكثر من 3 أيام بدون تسليم', ' appareil(s) de plus de 3 jours sans livraison', ' device(s) over 3 days without delivery');
INSERT INTO public.notif_phrases VALUES ('أجهزة متأخرة عندك', 'Appareils en retard chez vous', 'Late devices with you');
INSERT INTO public.notif_phrases VALUES (' جهاز أكثر من 3 أيام', ' appareil(s) de plus de 3 jours', ' device(s) over 3 days');
INSERT INTO public.notif_phrases VALUES ('ملخص اليوم 📊', 'Résumé du jour 📊', 'Today''s summary 📊');
INSERT INTO public.notif_phrases VALUES ('دخل ', 'Revenus ', 'Income ');
INSERT INTO public.notif_phrases VALUES (' · مصاريف ', ' · dépenses ', ' · expenses ');
INSERT INTO public.notif_phrases VALUES (' · تسليمات ', ' · livraisons ', ' · deliveries ');
INSERT INTO public.notif_phrases VALUES ('اختبار', 'Test', 'Test');
INSERT INTO public.notif_phrases VALUES ('من الخلفية', 'depuis l''arrière-plan', 'from the background');
INSERT INTO public.notif_phrases VALUES ('د.ت', 'DT', 'TND');
INSERT INTO public.notif_phrases VALUES (' أصبح: received', ' est maintenant : Reçu', ' is now: Received');
INSERT INTO public.notif_phrases VALUES (' أصبح: diagnosing', ' est maintenant : En cours d''examen', ' is now: Under inspection');
INSERT INTO public.notif_phrases VALUES (' أصبح: in_repair', ' est maintenant : En réparation', ' is now: Being repaired');
INSERT INTO public.notif_phrases VALUES (' أصبح: ready', ' est maintenant : Prêt à récupérer', ' is now: Ready for pickup');
INSERT INTO public.notif_phrases VALUES (' أصبح: delivered', ' est maintenant : Livré', ' is now: Delivered');
INSERT INTO public.notif_phrases VALUES (' أصبح: cancelled', ' est maintenant : Annulé', ' is now: Cancelled');

-- 8 ---------------------------------------------------------------- daily reminders
select cron.schedule('m4u-morning', '0 9 * * *',  'select public.run_morning_notifications()');
select cron.schedule('m4u-evening', '0 20 * * *', 'select public.run_evening_summary()');

-- 9 ---------------------------------------------------------------- phone push (EDIT 2 VALUES)
--   YOUR-PROJECT-REF        = the first part of your Supabase URL (https://abcdxyz.supabase.co -> abcdxyz)
--   PUT_YOUR_WEBHOOK_SECRET = the same long text you save as the secret WEBHOOK_SECRET (Edge Functions → Secrets)
create or replace function public.notify_send_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url     := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-webhook-secret', 'PUT_YOUR_WEBHOOK_SECRET'),
    body    := jsonb_build_object(
                 'type', 'INSERT',
                 'table', 'notifications',
                 'record', to_jsonb(new))
  );
  return new;
exception when others then
  -- a push problem must never block the notification itself
  return new;
end;
$$;

drop trigger if exists send_push_on_notification on public.notifications;
create trigger send_push_on_notification
  after insert on public.notifications
  for each row execute function public.notify_send_push();

drop trigger if exists send_push_on_notification on public.notifications;
create trigger send_push_on_notification
  after insert on public.notifications
  for each row execute function public.notify_send_push();

-- CHECK (insert a test notification, wait 5 seconds):
--   select id, status_code, left(content, 120) as answer, created from net._http_response order by created desc limit 5;
--   200 = ok   401 = "Verify JWT" still ON for send-push   403 = secret differs   404 = send-push not deployed   500 = see function logs
