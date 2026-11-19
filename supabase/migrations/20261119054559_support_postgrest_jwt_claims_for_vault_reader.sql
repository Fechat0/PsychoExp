CREATE OR REPLACE FUNCTION private.read_deepseek_api_key()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  caller_role text;
  api_key text;
BEGIN
  caller_role := nullif(current_setting('request.jwt.claim.role', true), '');
  IF caller_role IS NULL THEN
    BEGIN
      caller_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
    EXCEPTION WHEN OTHERS THEN
      caller_role := NULL;
    END;
  END IF;

  IF caller_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT decrypted_secret
    INTO api_key
    FROM vault.decrypted_secrets
   WHERE name = 'deepseek_api_key'
   ORDER BY created_at DESC
   LIMIT 1;

  RETURN api_key;
END;
$function$;

REVOKE ALL ON FUNCTION private.read_deepseek_api_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.read_deepseek_api_key() TO service_role;

NOTIFY pgrst, 'reload schema';
