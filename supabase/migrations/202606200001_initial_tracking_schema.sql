create extension if not exists pgcrypto;
create extension if not exists postgis;

create type public.app_role as enum ('passenger', 'driver', 'admin');
create type public.requested_role as enum ('passenger', 'driver');
create type public.driver_approval_status as enum ('none', 'pending', 'approved', 'rejected');
create type public.vehicle_status as enum ('active', 'inactive', 'full');
create type public.passenger_request_status as enum ('waiting', 'boarded', 'cancelled', 'expired');
create type public.rental_status as enum ('waiting', 'approved', 'rejected', 'completed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  whatsapp text,
  role public.app_role not null default 'passenger',
  requested_role public.requested_role,
  driver_status public.driver_approval_status not null default 'none',
  onboarding_complete boolean not null default false,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  province text,
  country_code char(2) not null default 'ID',
  center geography(point, 4326),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(name, province, country_code)
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references public.cities(id) on delete set null,
  code text not null,
  name text not null,
  description text,
  color text not null default '#64748b',
  path jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(city_id, code)
);
create unique index routes_global_code_unique on public.routes(code) where city_id is null;

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete restrict,
  route_id uuid references public.routes(id) on delete set null,
  plate_number text not null unique,
  capacity smallint not null default 12 check (capacity > 0),
  passenger_count smallint not null default 0 check (passenger_count >= 0 and passenger_count <= capacity),
  status public.vehicle_status not null default 'inactive',
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per vehicle: every share updates this row, never creates duplicate markers.
create table public.vehicle_locations (
  vehicle_id uuid primary key references public.vehicles(id) on delete cascade,
  position geography(point, 4326) not null,
  heading real,
  speed_kmh real,
  accuracy_m real,
  shared_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour')
);
create index vehicle_locations_position_idx on public.vehicle_locations using gist(position);
create index vehicle_locations_expiry_idx on public.vehicle_locations(expires_at);

create table public.passenger_requests (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.profiles(id) on delete cascade,
  route_id uuid references public.routes(id) on delete set null,
  pickup_position geography(point, 4326) not null,
  destination_name text not null default 'Menunggu angkot',
  destination_position geography(point, 4326),
  status public.passenger_request_status not null default 'waiting',
  shared_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  resolved_at timestamptz
);
create unique index one_waiting_request_per_passenger
  on public.passenger_requests(passenger_id) where status = 'waiting';
create index passenger_requests_pickup_idx on public.passenger_requests using gist(pickup_position);
create index passenger_requests_expiry_idx on public.passenger_requests(expires_at);

create table public.rental_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  route_id uuid references public.routes(id) on delete set null,
  assigned_vehicle_id uuid references public.vehicles(id) on delete set null,
  customer_phone text not null,
  pickup_name text not null,
  pickup_position geography(point, 4326),
  destination_name text not null,
  pickup_at timestamptz not null,
  duration_days integer not null default 1 check (duration_days > 0),
  passenger_count integer not null check (passenger_count > 0),
  note text,
  status public.rental_status not null default 'waiting',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rental_listings (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null unique references public.profiles(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  city_id uuid references public.cities(id) on delete set null,
  title text not null default 'Sewa angkot',
  description text,
  service_area text not null,
  whatsapp text not null,
  media_links text[] not null default '{}',
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rental_listings_area_idx on public.rental_listings using gin(to_tsvector('simple', service_area));

create table public.role_audit_log (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  old_role public.app_role,
  new_role public.app_role not null,
  changed_by uuid references public.profiles(id),
  reason text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

create or replace function public.is_approved_driver()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'driver' and driver_status = 'approved') $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  ) on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_touch before update on public.profiles for each row execute procedure public.touch_updated_at();
create trigger routes_touch before update on public.routes for each row execute procedure public.touch_updated_at();
create trigger vehicles_touch before update on public.vehicles for each row execute procedure public.touch_updated_at();
create trigger rentals_touch before update on public.rental_requests for each row execute procedure public.touch_updated_at();
create trigger rental_listings_touch before update on public.rental_listings for each row execute procedure public.touch_updated_at();

create or replace function public.approve_driver(target_user uuid, approve boolean, admin_reason text default null)
returns public.profiles language plpgsql security definer set search_path = public
as $$
declare previous_role public.app_role; result public.profiles;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select role into previous_role from public.profiles where id = target_user for update;
  update public.profiles set
    role = case when approve then 'driver'::public.app_role else 'passenger'::public.app_role end,
    driver_status = case when approve then 'approved'::public.driver_approval_status else 'rejected'::public.driver_approval_status end,
    approved_by = auth.uid(), approved_at = now()
  where id = target_user returning * into result;
  insert into public.role_audit_log(profile_id, old_role, new_role, changed_by, reason)
  values(target_user, previous_role, result.role, auth.uid(), admin_reason);
  return result;
end;
$$;

create or replace function public.complete_onboarding(choice public.requested_role, phone text default null)
returns public.profiles language plpgsql security definer set search_path = public
as $$
declare result public.profiles;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if choice = 'driver' and (phone is null or length(regexp_replace(phone, '[^0-9]', '', 'g')) < 9) then
    raise exception 'nomor WhatsApp tidak valid';
  end if;
  update public.profiles set
    requested_role = choice,
    whatsapp = case when choice = 'driver' then phone else whatsapp end,
    role = 'passenger',
    driver_status = case when choice = 'driver' then 'pending'::public.driver_approval_status else 'none'::public.driver_approval_status end,
    onboarding_complete = true
  where id = auth.uid() returning * into result;
  return result;
end;
$$;

create or replace function public.nearby_vehicles(origin_lat double precision, origin_lng double precision, radius_m integer default 10000, result_limit integer default 50)
returns table (
  id uuid, driver_name text, driver_phone text, plate_number text, route_code text, route_name text,
  color text, lat double precision, lng double precision, status text, last_updated timestamptz,
  capacity smallint, passenger_count smallint, distance_m double precision
) language sql stable security definer set search_path = public
as $$
  select v.id, p.full_name, p.whatsapp, v.plate_number, r.code, r.name, coalesce(r.color, '#64748b'),
    st_y(vl.position::geometry), st_x(vl.position::geometry), v.status::text, vl.shared_at,
    v.capacity, v.passenger_count,
    st_distance(vl.position, st_setsrid(st_makepoint(origin_lng, origin_lat), 4326)::geography)
  from public.vehicle_locations vl
  join public.vehicles v on v.id = vl.vehicle_id
  join public.profiles p on p.id = v.driver_id
  left join public.routes r on r.id = v.route_id
  where v.is_verified and v.status <> 'inactive' and vl.expires_at > now()
    and st_dwithin(vl.position, st_setsrid(st_makepoint(origin_lng, origin_lat), 4326)::geography, least(radius_m, 30000))
  order by vl.position <-> st_setsrid(st_makepoint(origin_lng, origin_lat), 4326)::geography
  limit least(result_limit, 100)
$$;

create or replace function public.nearby_passengers(origin_lat double precision, origin_lng double precision, radius_m integer default 10000, result_limit integer default 50)
returns table (
  id uuid, passenger_name text, phone text, route_code text, destination text,
  lat double precision, lng double precision, status text, last_updated timestamptz, distance_m double precision
) language sql stable security definer set search_path = public
as $$
  select pr.id, p.full_name, p.whatsapp, r.code, pr.destination_name,
    st_y(pr.pickup_position::geometry), st_x(pr.pickup_position::geometry), pr.status::text, pr.shared_at,
    st_distance(pr.pickup_position, st_setsrid(st_makepoint(origin_lng, origin_lat), 4326)::geography)
  from public.passenger_requests pr
  join public.profiles p on p.id = pr.passenger_id
  left join public.routes r on r.id = pr.route_id
  where pr.status = 'waiting' and pr.expires_at > now()
    and st_dwithin(pr.pickup_position, st_setsrid(st_makepoint(origin_lng, origin_lat), 4326)::geography, least(radius_m, 30000))
  order by pr.pickup_position <-> st_setsrid(st_makepoint(origin_lng, origin_lat), 4326)::geography
  limit least(result_limit, 100)
$$;

create or replace function public.expire_stale_tracking()
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.vehicles v set status = 'inactive'
  where status <> 'inactive' and exists (
    select 1 from public.vehicle_locations vl where vl.vehicle_id = v.id and vl.expires_at <= now()
  );
  update public.passenger_requests set status = 'expired', resolved_at = now()
  where status = 'waiting' and expires_at <= now();
end;
$$;

alter table public.profiles enable row level security;
alter table public.cities enable row level security;
alter table public.routes enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_locations enable row level security;
alter table public.passenger_requests enable row level security;
alter table public.rental_requests enable row level security;
alter table public.rental_listings enable row level security;
alter table public.role_audit_log enable row level security;

create policy "profiles read own or admin" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());
create policy "profiles update own safe fields" on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());
create policy "public reads active cities" on public.cities for select using (is_active);
create policy "public reads active routes" on public.routes for select using (is_active);
create policy "admins manage cities" on public.cities for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage routes" on public.routes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read verified vehicles" on public.vehicles for select using (is_verified or driver_id = auth.uid() or public.is_admin());
create policy "approved drivers create vehicles" on public.vehicles for insert to authenticated
with check (driver_id = auth.uid() and public.is_approved_driver());
create policy "drivers update own vehicles" on public.vehicles for update to authenticated
using (driver_id = auth.uid() and public.is_approved_driver()) with check (driver_id = auth.uid());
create policy "admins manage vehicles" on public.vehicles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read fresh vehicle locations" on public.vehicle_locations for select
using (expires_at > now());
create policy "drivers insert own location" on public.vehicle_locations for insert to authenticated
with check (exists(select 1 from public.vehicles v where v.id = vehicle_id and v.driver_id = auth.uid()) and public.is_approved_driver());
create policy "drivers update own location" on public.vehicle_locations for update to authenticated
using (exists(select 1 from public.vehicles v where v.id = vehicle_id and v.driver_id = auth.uid()) and public.is_approved_driver());
create policy "read waiting passenger requests" on public.passenger_requests for select to authenticated
using (status = 'waiting' and expires_at > now() and (public.is_approved_driver() or passenger_id = auth.uid() or public.is_admin()));
create policy "passengers create own request" on public.passenger_requests for insert to authenticated with check (passenger_id = auth.uid());
create policy "passengers update own request" on public.passenger_requests for update to authenticated
using (passenger_id = auth.uid()) with check (passenger_id = auth.uid());
create policy "customers read own rentals" on public.rental_requests for select to authenticated
using (customer_id = auth.uid() or public.is_admin() or public.is_approved_driver());
create policy "customers create rentals" on public.rental_requests for insert to authenticated with check (customer_id = auth.uid());
create policy "customers update waiting rentals" on public.rental_requests for update to authenticated
using (customer_id = auth.uid() and status = 'waiting') with check (customer_id = auth.uid());
create policy "admins manage rentals" on public.rental_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read available rental listings" on public.rental_listings for select using (is_available or driver_id = auth.uid() or public.is_admin());
create policy "approved drivers create rental listing" on public.rental_listings for insert to authenticated
with check (driver_id = auth.uid() and public.is_approved_driver());
create policy "drivers update own rental listing" on public.rental_listings for update to authenticated
using (driver_id = auth.uid() and public.is_approved_driver()) with check (driver_id = auth.uid());
create policy "admins manage rental listings" on public.rental_listings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins read role audit" on public.role_audit_log for select to authenticated using (public.is_admin());

grant execute on function public.approve_driver(uuid, boolean, text) to authenticated;
grant execute on function public.complete_onboarding(public.requested_role, text) to authenticated;
grant execute on function public.nearby_vehicles(double precision, double precision, integer, integer) to authenticated;
revoke execute on function public.nearby_passengers(double precision, double precision, integer, integer) from public, anon, authenticated;
grant execute on function public.nearby_passengers(double precision, double precision, integer, integer) to service_role;
revoke execute on function public.expire_stale_tracking() from public, anon, authenticated;
grant execute on function public.expire_stale_tracking() to service_role;
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, whatsapp) on public.profiles to authenticated;
