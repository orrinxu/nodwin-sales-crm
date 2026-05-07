-- supabase/migrations/20260510000000_custom_fields_currency_money.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-360: Update custom field currency validation to use MoneyData format
-- { cents: integer, currency: string } instead of raw JSON numbers.

CREATE OR REPLACE FUNCTION public.validate_custom_data(
  _entity_type text,
  custom_data jsonb
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key        text;
  _value      jsonb;
  _field      public.field_definitions%ROWTYPE;
  _val_text   text;
  _val_num    numeric;
  _opt_val    jsonb;
BEGIN
  -- ── Allow NULL or empty custom_data (only required fields enforced later) ──
  IF custom_data IS NULL OR custom_data = '{}'::jsonb THEN
    PERFORM 1 FROM public.field_definitions
      WHERE entity_type = _entity_type::public.field_entity_type
        AND active = true
        AND required = true;
    IF FOUND THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  -- ── Validate each key present in custom_data ────────────────────────────────
  FOR _key IN SELECT jsonb_object_keys(custom_data)
  LOOP
    _value := custom_data -> _key;

    SELECT * INTO _field
    FROM public.field_definitions
    WHERE entity_type = _entity_type::public.field_entity_type
      AND key = _key
      AND active = true;

    -- Key without a matching active definition is allowed (preserved from a
    -- soft-deleted field);
    CONTINUE WHEN NOT FOUND;

    -- Type validation
    CASE _field.data_type
      WHEN 'text', 'rich_text', 'url' THEN
        IF jsonb_typeof(_value) != 'string' THEN
          RETURN false;
        END IF;

      WHEN 'number' THEN
        IF jsonb_typeof(_value) != 'number' THEN
          RETURN false;
        END IF;

      WHEN 'currency' THEN
        -- MoneyData format: { cents: integer, currency: string }
        IF jsonb_typeof(_value) != 'object' THEN
          RETURN false;
        END IF;
        IF (_value ->> 'cents') IS NULL OR (_value ->> 'currency') IS NULL THEN
          RETURN false;
        END IF;
        IF jsonb_typeof(_value -> 'cents') != 'number' THEN
          RETURN false;
        END IF;
        IF jsonb_typeof(_value -> 'currency') != 'string' THEN
          RETURN false;
        END IF;
        -- currency code must be a valid identifier (1-8 alphanumeric chars, e.g. USD, EUR, USDT)
        IF (_value ->> 'currency') !~ '^[A-Z0-9]{1,8}$' THEN
          RETURN false;
        END IF;
        -- cents must be an integer (no fractional sub-units)
        IF (_value ->> 'cents')::numeric != floor((_value ->> 'cents')::numeric) THEN
          RETURN false;
        END IF;

      WHEN 'date' THEN
        IF jsonb_typeof(_value) != 'string'
           OR _value #>> '{}' !~ '^\d{4}-\d{2}-\d{2}$'
        THEN
          RETURN false;
        END IF;

      WHEN 'datetime' THEN
        IF jsonb_typeof(_value) != 'string' THEN
          RETURN false;
        END IF;

      WHEN 'boolean' THEN
        IF jsonb_typeof(_value) != 'boolean' THEN
          RETURN false;
        END IF;

      WHEN 'single_select' THEN
        IF jsonb_typeof(_value) != 'string' THEN
          RETURN false;
        END IF;
        IF _field.options IS NOT NULL THEN
          _val_text := _value #>> '{}';
          IF NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(_field.options) AS opt
            WHERE opt = _val_text
          ) THEN
            RETURN false;
          END IF;
        END IF;

      WHEN 'multi_select' THEN
        IF jsonb_typeof(_value) != 'array' THEN
          RETURN false;
        END IF;
        IF _field.options IS NOT NULL THEN
          FOR _opt_val IN SELECT jsonb_array_elements(_value)
          LOOP
            _val_text := _opt_val #>> '{}';
            IF _val_text IS NULL THEN
              RETURN false;
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(_field.options) AS opt
              WHERE opt = _val_text
            ) THEN
              RETURN false;
            END IF;
          END LOOP;
        END IF;

      WHEN 'user_ref', 'account_ref' THEN
        IF jsonb_typeof(_value) != 'string' THEN
          RETURN false;
        END IF;

      WHEN 'formula' THEN
        -- Formula results accept any type — computed at read time
        NULL;

      ELSE
        NULL;
    END CASE;
  END LOOP;

  -- ── Check required fields ───────────────────────────────────────────────────
  FOR _field IN
    SELECT * FROM public.field_definitions
    WHERE entity_type = _entity_type::public.field_entity_type
      AND active = true
      AND required = true
  LOOP
    IF NOT custom_data ? _field.key THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;
