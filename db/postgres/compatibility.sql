CREATE SCHEMA IF NOT EXISTS harimu_compat;
CREATE OR REPLACE FUNCTION harimu_compat.sqlite_typeof(value anyelement) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN value IS NULL THEN 'null' WHEN pg_typeof(value)::text IN ('bigint','integer','smallint') THEN 'integer' WHEN pg_typeof(value)::text IN ('numeric','real','double precision') THEN 'real' WHEN pg_typeof(value)::text='bytea' THEN 'blob' ELSE 'text' END
$$;
CREATE OR REPLACE FUNCTION harimu_compat.json_valid(value text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN IF value IS NULL THEN RETURN false; END IF; PERFORM value::jsonb; RETURN true; EXCEPTION WHEN others THEN RETURN false; END
$$;
CREATE OR REPLACE FUNCTION harimu_compat.julianday(value text,modifier text DEFAULT '') RETURNS numeric LANGUAGE plpgsql STABLE AS $$
DECLARE seconds numeric;
BEGIN
 IF value IS NULL OR value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}' THEN RETURN NULL; END IF;
 IF modifier NOT IN ('','+48 hours') THEN RETURN NULL; END IF;
 seconds:=extract(epoch FROM value::timestamptz);
 IF modifier='+48 hours' THEN seconds:=seconds+172800; END IF;
 RETURN seconds/86400+2440587.5;
EXCEPTION WHEN others THEN RETURN NULL;
END
$$;
CREATE OR REPLACE FUNCTION harimu_compat.unix_seconds(value text) RETURNS bigint LANGUAGE plpgsql STABLE AS $$
BEGIN RETURN floor(extract(epoch FROM value::timestamptz))::bigint;
EXCEPTION WHEN others THEN RETURN NULL;
END
$$;
