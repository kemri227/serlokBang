-- Rental is an informational directory. The platform does not quote or process prices.
alter table public.rental_listings add column if not exists media_links text[] not null default '{}';
alter table public.rental_listings drop column if exists base_price;
alter table public.rental_requests drop column if exists estimated_price;

