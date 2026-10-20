-- pg_net was created in the public schema (advisor 0014). It can't be moved with
-- ALTER EXTENSION, so recreate it in the extensions schema. Its functions stay
-- in the net schema, which radar_call_function() already uses. Only pg_net's
-- response log is lost, which is temporary anyway.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
