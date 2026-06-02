-- Alinea profiles con el cliente (weight_kg, height_cm) y migra columnas legacy si existen.
-- Requiere: 001_create_profiles.sql

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'weight_kg'
  ) then
    alter table public.profiles
      add column weight_kg numeric(5, 2)
      check (weight_kg is null or (weight_kg >= 40 and weight_kg <= 150));
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'height_cm'
  ) then
    alter table public.profiles
      add column height_cm integer
      check (height_cm is null or (height_cm >= 140 and height_cm <= 220));
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'weight'
  ) then
    execute $sql$
      update public.profiles
      set weight_kg = weight::numeric(5, 2)
      where weight_kg is null and weight is not null
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'height'
  ) then
    execute $sql$
      update public.profiles
      set height_cm = height::integer
      where height_cm is null and height is not null
    $sql$;
  end if;
end
$$;
