import { createClient, type User } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { trackingTopic } from "../lib/trackingTopics";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

export const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

export const trackingRedis = redisUrl && redisToken
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

export const persistentServicesConfigured = Boolean(supabaseAdmin);

export async function getUserFromAuthorization(authorization?: string): Promise<User | null> {
  if (!supabaseAdmin) return null;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : data.user;
}

export async function cacheActiveLocation(
  kind: "vehicle" | "passenger",
  id: string,
  lat: number,
  lng: number,
  payload: Record<string, unknown>,
) {
  if (supabaseAdmin) {
    const channel = supabaseAdmin.channel(trackingTopic(kind, lat, lng));
    await channel.send({ type: "broadcast", event: "location_changed", payload: { kind, id, lat, lng, ...payload } });
    await supabaseAdmin.removeChannel(channel);
  }
  if (!trackingRedis) return;
  const geoKey = `tracking:${kind}:geo`;
  const stateKey = `tracking:${kind}:state:${id}`;
  const channel = `tracking:${kind}:updates`;
  const pipeline = trackingRedis.pipeline();
  pipeline.geoadd(geoKey, { latitude: lat, longitude: lng, member: id });
  pipeline.set(stateKey, payload, { ex: 60 * 60 });
  pipeline.publish(channel, JSON.stringify({ id, lat, lng, ...payload }));
  await pipeline.exec();
}

export async function removeCachedLocation(kind: "vehicle" | "passenger", id: string, lat?: number, lng?: number) {
  if (supabaseAdmin && Number.isFinite(lat) && Number.isFinite(lng)) {
    const channel = supabaseAdmin.channel(trackingTopic(kind, lat!, lng!));
    await channel.send({ type: "broadcast", event: "location_changed", payload: { kind, id, removed: true } });
    await supabaseAdmin.removeChannel(channel);
  }
  if (!trackingRedis) return;
  const pipeline = trackingRedis.pipeline();
  pipeline.zrem(`tracking:${kind}:geo`, id);
  pipeline.del(`tracking:${kind}:state:${id}`);
  pipeline.publish(`tracking:${kind}:updates`, JSON.stringify({ id, removed: true }));
  await pipeline.exec();
}

export async function persistPassengerLocation(userId: string, input: {
  lat: number; lng: number; destination: string; routeCode: string;
}) {
  if (!supabaseAdmin) return;
  const { data: route } = await supabaseAdmin.from("routes").select("id").eq("code", input.routeCode).maybeSingle();
  const existing = await supabaseAdmin.from("passenger_requests").select("id")
    .eq("passenger_id", userId).eq("status", "waiting").maybeSingle();
  const values = {
    passenger_id: userId,
    route_id: route?.id || null,
    pickup_position: `POINT(${input.lng} ${input.lat})`,
    destination_name: input.destination,
    status: "waiting",
    shared_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
  const query = existing.data?.id
    ? supabaseAdmin.from("passenger_requests").update(values).eq("id", existing.data.id)
    : supabaseAdmin.from("passenger_requests").insert(values);
  const { error } = await query;
  if (error) throw error;
}

export async function persistPassengerStatus(userId: string, status: "boarded" | "cancelled") {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin.from("passenger_requests")
    .update({ status, resolved_at: new Date().toISOString() })
    .eq("passenger_id", userId).eq("status", "waiting");
  if (error) throw error;
}

export async function persistVehicleLocation(userId: string, input: {
  plateNumber: string; routeCode: string; routeName?: string; driverName: string; driverPhone?: string;
  lat: number; lng: number; passengerCount: number; status: "aktif" | "tidak_aktif";
}) {
  if (!supabaseAdmin) return;
  const { data: profile } = await supabaseAdmin.from("profiles").select("role,driver_status").eq("id", userId).single();
  if (profile?.role !== "driver" || profile.driver_status !== "approved") throw new Error("Akun supir belum disetujui admin.");
  let { data: route } = await supabaseAdmin.from("routes").select("id").eq("code", input.routeCode).maybeSingle();
  if (!route) {
    const createdRoute = await supabaseAdmin.from("routes").insert({
      code: input.routeCode,
      name: input.routeName || `Trayek ${input.routeCode}`,
      created_by: userId,
    }).select("id").single();
    if (createdRoute.error) throw createdRoute.error;
    route = createdRoute.data;
  }
  let { data: vehicle } = await supabaseAdmin.from("vehicles").select("id").eq("driver_id", userId).maybeSingle();
  if (!vehicle) {
    const created = await supabaseAdmin.from("vehicles").insert({
      driver_id: userId,
      route_id: route?.id || null,
      plate_number: input.plateNumber,
      passenger_count: input.passengerCount,
      status: input.status === "aktif" ? "active" : "inactive",
      is_verified: true,
    }).select("id").single();
    if (created.error) throw created.error;
    vehicle = created.data;
  }
  const { error } = await supabaseAdmin.from("vehicle_locations").upsert({
    vehicle_id: vehicle.id,
    position: `POINT(${input.lng} ${input.lat})`,
    shared_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }, { onConflict: "vehicle_id" });
  if (error) throw error;
}

export async function loadNearbyVehicles(lat: number, lng: number, radiusKm = 10, limit = 50) {
  if (!supabaseAdmin || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const { data, error } = await supabaseAdmin.rpc("nearby_vehicles", {
    origin_lat: lat, origin_lng: lng, radius_m: radiusKm * 1000, result_limit: limit,
  });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id, driverName: row.driver_name || "Supir", driverPhone: row.driver_phone,
    plateNumber: row.plate_number, routeCode: row.route_code || "lainnya", routeName: row.route_name || "Rute lainnya",
    color: row.color, lat: row.lat, lng: row.lng,
    status: row.status === "inactive" ? "tidak_aktif" : "aktif", lastUpdated: row.last_updated,
    kapasitas: row.capacity, penumpangAktif: row.passenger_count,
  }));
}

export async function loadNearbyPassengers(lat: number, lng: number, radiusKm = 10, limit = 50) {
  if (!supabaseAdmin || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const { data, error } = await supabaseAdmin.rpc("nearby_passengers", {
    origin_lat: lat, origin_lng: lng, radius_m: radiusKm * 1000, result_limit: limit,
  });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id, name: row.passenger_name || "Penumpang", phone: row.phone || "",
    routeCode: row.route_code || "lainnya", destination: row.destination,
    lat: row.lat, lng: row.lng, status: "menunggu", lastUpdated: row.last_updated,
  }));
}

export async function loadRentals(userId: string, role: string) {
  if (!supabaseAdmin) return null;
  let query = supabaseAdmin.from("rental_requests").select("*,routes(code)").order("created_at", { ascending: false });
  if (role === "passenger") query = query.eq("customer_id", userId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    customerName: "Pelanggan",
    customerPhone: row.customer_phone,
    pickupLocation: row.pickup_name,
    destination: row.destination_name,
    pickupDate: row.pickup_at.slice(0, 10),
    pickupTime: new Date(row.pickup_at).toTimeString().slice(0, 5),
    durationDays: row.duration_days,
    passengersCount: row.passenger_count,
    note: row.note || "",
    status: row.status === "approved" ? "disetujui" : row.status === "rejected" ? "ditolak" : "menunggu",
    routeCode: row.routes?.code || "lainnya",
    createdAt: row.created_at,
  }));
}

export async function persistRental(userId: string, input: {
  customerPhone: string; pickupLocation: string; destination: string; pickupAt: string;
  durationDays: number; passengersCount: number; note?: string; routeCode?: string;
}) {
  if (!supabaseAdmin) return null;
  const { data: route } = input.routeCode
    ? await supabaseAdmin.from("routes").select("id").eq("code", input.routeCode).maybeSingle()
    : { data: null };
  const { data, error } = await supabaseAdmin.from("rental_requests").insert({
    customer_id: userId,
    route_id: route?.id || null,
    customer_phone: input.customerPhone,
    pickup_name: input.pickupLocation,
    destination_name: input.destination,
    pickup_at: input.pickupAt,
    duration_days: input.durationDays,
    passenger_count: input.passengersCount,
    note: input.note || null,
  }).select("id,created_at").single();
  if (error) throw error;
  return data;
}

export async function persistRentalStatus(id: string, status: "approved" | "rejected") {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin.from("rental_requests").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function expirePersistentTracking() {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin.rpc("expire_stale_tracking");
  if (error) throw error;
}

export async function persistVehicleStatus(userId: string, status: "aktif" | "tidak_aktif", passengerCount: number) {
  if (!supabaseAdmin) return;
  const { data: profile } = await supabaseAdmin.from("profiles").select("role,driver_status").eq("id", userId).single();
  if (profile?.role !== "driver" || profile.driver_status !== "approved") throw new Error("Akun supir belum disetujui admin.");
  const { error } = await supabaseAdmin.from("vehicles").update({
    status: status === "aktif" ? (passengerCount >= 12 ? "full" : "active") : "inactive",
    passenger_count: passengerCount,
  }).eq("driver_id", userId);
  if (error) throw error;
}

export async function loadRentalListings(area = "", limit = 24) {
  if (!supabaseAdmin) return null;
  let query = supabaseAdmin.from("rental_listings").select(`
    id,title,description,service_area,whatsapp,media_links,is_available,
    profiles!rental_listings_driver_id_fkey(full_name),
    vehicles(plate_number,routes(code,name))
  `).eq("is_available", true).order("updated_at", { ascending: false }).limit(Math.min(limit, 50));
  if (area.trim()) query = query.ilike("service_area", `%${area.trim()}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    driverName: row.profiles?.full_name || "Supir",
    driverPhone: row.whatsapp,
    plateNumber: row.vehicles?.plate_number || "Armada",
    routeCode: row.vehicles?.routes?.code || "lainnya",
    routeName: row.vehicles?.routes?.name || row.service_area,
    title: row.title,
    description: row.description || "",
    serviceArea: row.service_area,
    mediaLinks: Array.isArray(row.media_links) ? row.media_links : [],
    isAvailable: row.is_available,
  }));
}

export async function upsertRentalListing(userId: string, input: {
  title: string; description?: string; serviceArea: string; whatsapp: string; mediaLinks?: string[]; isAvailable?: boolean;
}) {
  if (!supabaseAdmin) return null;
  const { data: profile } = await supabaseAdmin.from("profiles").select("role,driver_status").eq("id", userId).single();
  if (profile?.role !== "driver" || profile.driver_status !== "approved") throw new Error("Akun supir belum disetujui admin.");
  const { data: vehicle } = await supabaseAdmin.from("vehicles").select("id").eq("driver_id", userId).maybeSingle();
  const { data, error } = await supabaseAdmin.from("rental_listings").upsert({
    driver_id: userId,
    vehicle_id: vehicle?.id || null,
    title: input.title,
    description: input.description || null,
    service_area: input.serviceArea,
    whatsapp: input.whatsapp,
    media_links: input.mediaLinks || [],
    is_available: input.isAvailable ?? true,
  }, { onConflict: "driver_id" }).select("id").single();
  if (error) throw error;
  return data;
}
