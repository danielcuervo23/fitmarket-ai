-- FitMarket AI: historial de planes liviano y tope de tamaño de plan_json.
-- Requiere: 003 (weekly_plans) y 007.
-- Idempotente: se puede ejecutar más de una vez sin error.
-- No toca las políticas RLS (eso queda para una fase posterior de FIX-05).
--
-- AVISO DE BLOQUEO: agregar la columna generada (paso 1) reescribe la tabla
-- completa con un bloqueo exclusivo, y crear el índice (paso 2) impide
-- escribir mientras se construye. Mientras dure, nadie puede leer ni guardar
-- planes. Hoy la tabla es pequeña y tarda un instante: aplicarla en horario
-- de poco tráfico. Con una tabla grande (miles de usuarios) NO usar este
-- archivo así: usar una columna normal llenada por un trigger, rellenar las
-- filas antiguas por lotes y crear el índice con CREATE INDEX CONCURRENTLY
-- (en un archivo aparte, porque CONCURRENTLY no corre dentro de una
-- transacción).

-- Si otra conexión tiene la tabla ocupada, esperar como máximo 5 s y fallar,
-- en vez de quedar en cola bloqueando a todos los que llegan detrás.
-- "set local" dura solo hasta el final de la transacción: supabase db push
-- ejecuta cada migración dentro de una transacción, así que el ajuste no se
-- queda pegado a la conexión. Si falla por tiempo, basta con reintentar.
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Cantidad de productos de la lista de mercado, precalculada
-- ---------------------------------------------------------------------------
-- La pantalla de historial solo muestra 3 números por plan. Los dos del
-- resumen se leen con rutas JSON (plan_json->summary->...), pero contar la
-- lista de mercado obligaba a descargar el plan completo (~10 KB). Esta
-- columna generada guarda el conteo al insertar o modificar la fila.
-- Si shopping_list falta o no es un array, queda en null (nunca hace fallar
-- un insert: jsonb_array_length solo se llama cuando es un array).

alter table public.weekly_plans
  add column if not exists shopping_item_count integer
  generated always as (
    case
      when jsonb_typeof(plan_json -> 'shopping_list') = 'array'
        then jsonb_array_length(plan_json -> 'shopping_list')
      else null
    end
  ) stored;

comment on column public.weekly_plans.shopping_item_count is
  'Cantidad de productos en plan_json.shopping_list (null si no es un array). Generada; no se escribe a mano.';

-- ---------------------------------------------------------------------------
-- 2. Índice para listar los planes de un usuario, del más reciente al más antiguo
-- ---------------------------------------------------------------------------
-- El historial filtra por user_id y ordena por created_at desc, id desc con
-- paginado (id desempata dos planes creados en el mismo instante, para que no
-- se repitan ni se salten entre páginas); el plan actual también se busca
-- así. Con este índice Postgres lee las filas ya ordenadas y se detiene al
-- llegar a la página pedida.
-- Mejora futura: paginar por cursor (created_at, id) en vez de por posición,
-- para que borrar un plan mientras se pagina no salte ninguna fila. Hoy no
-- hace falta: la app no permite borrar un plan suelto.

create index if not exists weekly_plans_user_id_created_at_id_idx
  on public.weekly_plans (user_id, created_at desc, id desc);

-- Versión anterior de este índice (sin id), por si se llegó a crear en
-- alguna base de prueba con un borrador de esta migración.
drop index if exists public.weekly_plans_user_id_created_at_idx;

-- El índice simple de 003 queda redundante: el compuesto empieza por
-- user_id, así que sirve igual para "where user_id = ..." (incluido el
-- borrado en cascada desde auth.users). Mantener los dos solo cuesta espacio
-- y escrituras más lentas.

drop index if exists public.weekly_plans_user_id_idx;

-- ---------------------------------------------------------------------------
-- 3. Tope de tamaño para plan_json: 256 KB
-- ---------------------------------------------------------------------------
-- Un plan grande real ocupa ~10 KB, así que el tope no bloquea planes
-- legítimos; evita que alguien guarde documentos enormes en la tabla.
-- Se mide sobre el texto JSON. NOT VALID para no fallar con filas antiguas;
-- se aplica igual a toda fila nueva o modificada.
-- Solo se crea si no existe: así, volver a ejecutar este archivo no deshace
-- un "alter table ... validate constraint" que se haga más adelante.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.weekly_plans'::regclass
      and conname = 'weekly_plans_plan_json_size'
  ) then
    alter table public.weekly_plans
      add constraint weekly_plans_plan_json_size check (
        octet_length(plan_json::text) <= 262144
      ) not valid;
  end if;
end;
$$;
