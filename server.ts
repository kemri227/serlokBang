import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Angkot, Passenger, RentalRequest, ROUTE_LIST } from "./src/types.js";
import {
  cacheActiveLocation,
  expirePersistentTracking,
  getUserFromAuthorization,
  loadNearbyPassengers,
  loadNearbyVehicles,
  loadRentals,
  loadRentalListings,
  persistPassengerLocation,
  persistPassengerStatus,
  persistRental,
  persistRentalStatus,
  persistVehicleLocation,
  persistVehicleStatus,
  persistentServicesConfigured,
  removeCachedLocation,
  supabaseAdmin,
  upsertRentalListing,
} from "./src/server/services.js";

// In-Memory Database (will persist while container is running, perfect for tracking simulation!)
let angkots: Angkot[] = [
  {
    id: "angkot-05",
    driverName: "Mang Usep",
    plateNumber: "D 1902 AB",
    routeCode: "05",
    routeName: "Cicaheum - Ledeng",
    color: "emerald",
    lat: -6.9020,
    lng: 107.6450,
    status: "aktif",
    lastUpdated: new Date().toISOString(),
    kapasitas: 12,
    penumpangAktif: 4,
    driverPhone: "081234567891"
  },
  {
    id: "angkot-02",
    driverName: "Kang Cecep",
    plateNumber: "D 1412 BB",
    routeCode: "02",
    routeName: "Dago - Kalapa",
    color: "amber",
    lat: -6.9090,
    lng: 107.6105,
    status: "aktif",
    lastUpdated: new Date().toISOString(),
    kapasitas: 12,
    penumpangAktif: 8,
    driverPhone: "082345678912"
  },
  {
    id: "angkot-34",
    driverName: "Mang Udin",
    plateNumber: "D 1205 CC",
    routeCode: "34",
    routeName: "Sadang Serang - Caringin",
    color: "sky",
    lat: -6.9200,
    lng: 107.6200,
    status: "aktif",
    lastUpdated: new Date().toISOString(),
    kapasitas: 12,
    penumpangAktif: 1,
    driverPhone: "083456789123"
  },
  {
    id: "angkot-08",
    driverName: "Kang Asep",
    plateNumber: "D 1745 XY",
    routeCode: "08",
    routeName: "Cicaheum - Cibaduyut",
    color: "rose",
    lat: -6.9130,
    lng: 107.6400,
    status: "aktif",
    lastUpdated: new Date().toISOString(),
    kapasitas: 12,
    penumpangAktif: 3,
    driverPhone: "084567891234"
  }
];

let passengers: Passenger[] = [
  {
    id: "pax-1",
    name: "Ahmad",
    phone: "08123456789",
    lat: -6.9110,
    lng: 107.6150,
    destination: "Cicaheum",
    routeCode: "05",
    status: "menunggu",
    lastUpdated: new Date().toISOString()
  },
  {
    id: "pax-2",
    name: "Siti Nurhaliza",
    phone: "08987654321",
    lat: -6.9180,
    lng: 107.6040,
    destination: "Dago",
    routeCode: "02",
    status: "menunggu",
    lastUpdated: new Date().toISOString()
  }
];

let rentals: RentalRequest[] = [
  {
    id: "rent-1",
    customerName: "Budi Santoso",
    customerPhone: "085211223344",
    pickupLocation: "Gedung Sate",
    destination: "Lembang (Sangkuriang)",
    pickupDate: "2026-06-25",
    pickupTime: "08:00",
    durationDays: 1,
    passengersCount: 10,
    note: "Acara gathering keluarga, butuh bagasi bersih",
    status: "disetujui",
    routeCode: "05",
    createdAt: new Date().toISOString()
  }
];

const LOCATION_TTL_MS = 60 * 60 * 1000;
const MIN_SHARE_INTERVAL_MS = 10 * 1000;
const DEFAULT_NEARBY_RADIUS_KM = 10;
const DEFAULT_MARKER_LIMIT = 50;
const lastLocationShare = new Map<string, number>();

function normalizeMediaLinks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).flatMap((item) => {
    if (typeof item !== "string" || item.length > 500) return [];
    try {
      const url = new URL(item.trim());
      return url.protocol === "https:" || url.protocol === "http:" ? [url.toString()] : [];
    } catch {
      return [];
    }
  });
}

function expireStaleMarkers() {
  const cutoff = Date.now() - LOCATION_TTL_MS;
  angkots.forEach((angkot) => {
    if (new Date(angkot.lastUpdated).getTime() < cutoff) angkot.status = "tidak_aktif";
  });
  passengers.forEach((passenger) => {
    if (passenger.status === "menunggu" && new Date(passenger.lastUpdated).getTime() < cutoff) {
      passenger.status = "batal";
    }
  });
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearbyQuery<T extends { lat: number; lng: number }>(items: T[], query: Record<string, unknown>) {
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  const radiusKm = Math.min(Math.max(Number(query.radius) || DEFAULT_NEARBY_RADIUS_KM, 1), 30);
  const limit = Math.min(Math.max(Number(query.limit) || DEFAULT_MARKER_LIMIT, 1), 100);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return query.nearby === "1" ? [] : items.slice(0, limit);
  }

  return items
    .map((item) => ({ item, distance: distanceKm(lat, lng, item.lat, item.lng) }))
    .filter(({ distance }) => distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(({ item }) => item);
}

function isShareRateLimited(key: string) {
  const now = Date.now();
  const previous = lastLocationShare.get(key) || 0;
  if (now - previous < MIN_SHARE_INTERVAL_MS) {
    return Math.ceil((MIN_SHARE_INTERVAL_MS - (now - previous)) / 1000);
  }
  lastLocationShare.set(key, now);
  return 0;
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const asyncHandler = (handler: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<unknown>) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => void Promise.resolve(handler(req, res, next)).catch(next);

  // Middleware for body parsing
  app.use(express.json());

  // In production, all mutations require a valid Supabase access token.
  // Local in-memory development remains available until credentials are set.
  app.use("/api", asyncHandler(async (req, res, next) => {
    if (!persistentServicesConfigured) return next();
    const user = await getUserFromAuthorization(req.header("authorization"));
    if (!user) return res.status(401).json({ error: "Silakan masuk kembali untuk melanjutkan." });
    res.locals.userId = user.id;
    const { data: profile } = await supabaseAdmin!.from("profiles").select("role,driver_status").eq("id", user.id).single();
    res.locals.appRole = profile?.role || "passenger";
    res.locals.driverStatus = profile?.driver_status || "none";
    next();
  }));

  // API Logging
  app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
  });

  // --- API ENDPOINTS ---

  // 1. Get all active angkots
  app.get("/api/angkots", asyncHandler(async (req, res) => {
    expireStaleMarkers();
    if (persistentServicesConfigured) {
      await expirePersistentTracking();
      const data = await loadNearbyVehicles(Number(req.query.lat), Number(req.query.lng), Number(req.query.radius) || 10, Number(req.query.limit) || 50);
      return res.json(data || []);
    }
    res.json(nearbyQuery(angkots, req.query));
  }));

  // 2. Register or update driver/angkot coordinate
  app.post("/api/angkots/update", asyncHandler(async (req, res) => {
    const { id, clientKey, driverName, plateNumber, routeCode, routeName, color, lat, lng, status, penumpangAktif, driverPhone } = req.body;

    if (!driverName || !plateNumber || !routeCode || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: "Data kurang lengkap" });
    }

    const retryAfter = isShareRateLimited(`driver:${id || clientKey || plateNumber}`);
    if (retryAfter) {
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ error: `Tunggu ${retryAfter} detik sebelum membagikan lokasi lagi.` });
    }

    const matchedRoute = ROUTE_LIST.find((r) => r.code === routeCode);
    const resolvedRouteName = routeName || (matchedRoute ? matchedRoute.name : `Jalur ${routeCode}`);
    const resolvedColor = color || (matchedRoute ? matchedRoute.color : "emerald");

    const index = angkots.findIndex((a) => a.id === id || a.plateNumber === plateNumber);

    const angkotData: Angkot = {
      id: id || `angkot-${Date.now()}`,
      driverName,
      plateNumber,
      routeCode,
      routeName: resolvedRouteName,
      color: resolvedColor,
      lat: Number(lat),
      lng: Number(lng),
      status: status || "aktif",
      lastUpdated: new Date().toISOString(),
      kapasitas: 12,
      penumpangAktif: penumpangAktif !== undefined ? Number(penumpangAktif) : 0,
      driverPhone: driverPhone || "08123456789"
    };

    if (index !== -1) {
      angkots[index] = { ...angkots[index], ...angkotData, id: angkots[index].id };
      if (res.locals.userId) await persistVehicleLocation(res.locals.userId, {
        plateNumber, routeCode, routeName: resolvedRouteName, driverName, driverPhone, lat: Number(lat), lng: Number(lng),
        passengerCount: Number(penumpangAktif || 0), status: status || "aktif",
      });
      await cacheActiveLocation("vehicle", angkots[index].id, Number(lat), Number(lng), {
        driverName, routeCode, routeName: resolvedRouteName, plateNumber,
        color: angkots[index].color, status: angkots[index].status, lastUpdated: angkots[index].lastUpdated,
        kapasitas: angkots[index].kapasitas, penumpangAktif: angkots[index].penumpangAktif,
      });
      res.json({ message: "Posisi Angkot berhasil diperbarui", data: angkots[index] });
    } else {
      angkots.push(angkotData);
      if (res.locals.userId) await persistVehicleLocation(res.locals.userId, {
        plateNumber, routeCode, routeName: resolvedRouteName, driverName, driverPhone, lat: Number(lat), lng: Number(lng),
        passengerCount: Number(penumpangAktif || 0), status: status || "aktif",
      });
      await cacheActiveLocation("vehicle", angkotData.id, Number(lat), Number(lng), {
        driverName, routeCode, routeName: resolvedRouteName, plateNumber,
        color: angkotData.color, status: angkotData.status, lastUpdated: angkotData.lastUpdated,
        kapasitas: angkotData.kapasitas, penumpangAktif: angkotData.penumpangAktif,
      });
      res.json({ message: "Angkot baru berhasil didaftarkan", data: angkotData });
    }
  }));

  // Update status or active count manually
  app.post("/api/angkots/status", asyncHandler(async (req, res) => {
    const { id, status, penumpangAktif } = req.body;
    if (persistentServicesConfigured && res.locals.userId) {
      await persistVehicleStatus(res.locals.userId, status || "aktif", Number(penumpangAktif || 0));
      return res.json({ message: "Status angkot berhasil diperbarui" });
    }
    const angkot = angkots.find(a => a.id === id);
    if (!angkot) {
      return res.status(404).json({ error: "Angkot tidak ditemukan" });
    }
    if (status !== undefined) angkot.status = status;
    if (penumpangAktif !== undefined) angkot.penumpangAktif = Number(penumpangAktif);
    angkot.lastUpdated = new Date().toISOString();
    res.json({ message: "Status Angkot berhasil diperbarui", data: angkot });
  }));

  // 3. Get waiting passengers
  app.get("/api/passengers", asyncHandler(async (req, res) => {
    expireStaleMarkers();
    if (persistentServicesConfigured) {
      if (res.locals.appRole !== "driver" && res.locals.appRole !== "admin") return res.json([]);
      const data = await loadNearbyPassengers(Number(req.query.lat), Number(req.query.lng), Number(req.query.radius) || 10, Number(req.query.limit) || 50);
      return res.json(data || []);
    }
    res.json(nearbyQuery(passengers.filter(p => p.status === "menunggu"), req.query));
  }));

  // 4. Create or update passenger location
  app.post("/api/passengers/update", asyncHandler(async (req, res) => {
    const { id, clientKey, name, phone, lat, lng, destination, routeCode } = req.body;

    if (!name || !phone || lat === undefined || lng === undefined || !destination || !routeCode) {
      return res.status(400).json({ error: "Data penumpang kurang lengkap" });
    }

    const retryAfter = isShareRateLimited(`passenger:${id || clientKey || phone}`);
    if (retryAfter) {
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ error: `Tunggu ${retryAfter} detik sebelum membagikan lokasi lagi.` });
    }

    const stablePassengerId = res.locals.userId || id;
    const passengerIndex = passengers.findIndex(p =>
      p.id === stablePassengerId || (!persistentServicesConfigured && p.phone === phone && p.status === "menunggu")
    );

    const passengerData: Passenger = {
      id: stablePassengerId || `pax-${Date.now()}`,
      name,
      phone,
      lat: Number(lat),
      lng: Number(lng),
      destination,
      routeCode,
      status: "menunggu",
      lastUpdated: new Date().toISOString()
    };

    if (passengerIndex !== -1) {
      passengers[passengerIndex] = passengerData;
      if (res.locals.userId) await persistPassengerLocation(res.locals.userId, { lat: Number(lat), lng: Number(lng), destination, routeCode });
      await cacheActiveLocation("passenger", passengerData.id, Number(lat), Number(lng), {
        name, routeCode, destination, status: passengerData.status, lastUpdated: passengerData.lastUpdated,
      });
      res.json({ message: "Posisi penjemputan berhasil diperbarui", data: passengerData });
    } else {
      passengers.push(passengerData);
      if (res.locals.userId) await persistPassengerLocation(res.locals.userId, { lat: Number(lat), lng: Number(lng), destination, routeCode });
      await cacheActiveLocation("passenger", passengerData.id, Number(lat), Number(lng), {
        name, routeCode, destination, status: passengerData.status, lastUpdated: passengerData.lastUpdated,
      });
      res.json({ message: "Permintaan penjemputan baru terkirim", data: passengerData });
    }
  }));

  // 5. Update passenger status (batal / sudah naik)
  app.post("/api/passengers/status", asyncHandler(async (req, res) => {
    const { id, status, lat, lng } = req.body; // status: "sudah_naik" or "batal"

    if (!id || !["sudah_naik", "batal", "menunggu"].includes(status)) {
      return res.status(400).json({ error: "ID atau status tidak valid" });
    }

    if (persistentServicesConfigured && res.locals.userId && status !== "menunggu") {
      await persistPassengerStatus(res.locals.userId, status === "sudah_naik" ? "boarded" : "cancelled");
      await removeCachedLocation("passenger", id, Number(lat), Number(lng));
      return res.json({ message: `Status penumpang diubah menjadi ${status}` });
    }

    const passenger = passengers.find(p => p.id === id);
    if (!passenger) {
      return res.status(404).json({ error: "Penumpang tidak ditemukan" });
    }

    passenger.status = status;
    passenger.lastUpdated = new Date().toISOString();
    if (status !== "menunggu") await removeCachedLocation("passenger", passenger.id);

    // Remove from active list if resolved/cancelled, let keeping logs of total
    res.json({ message: `Status penumpang diubah menjadi ${status}`, data: passenger });
  }));

  // 6. Get all sewa requests
  app.get("/api/rental-listings", asyncHandler(async (req, res) => {
    if (persistentServicesConfigured) {
      const data = await loadRentalListings(String(req.query.area || ""), Number(req.query.limit) || 24);
      return res.json(data || []);
    }
    return res.json(angkots.slice(0, 24).map((angkot) => ({
      id: angkot.id, driverName: angkot.driverName, driverPhone: angkot.driverPhone || "",
      plateNumber: angkot.plateNumber, routeCode: angkot.routeCode, routeName: angkot.routeName,
      title: `Sewa ${angkot.plateNumber}`, description: "", serviceArea: angkot.routeName,
      mediaLinks: [], isAvailable: true,
    })));
  }));

  app.post("/api/rental-listings", asyncHandler(async (req, res) => {
    const { title, description, serviceArea, whatsapp, mediaLinks, isAvailable } = req.body;
    if (!title || !serviceArea || !whatsapp) return res.status(400).json({ error: "Judul, wilayah layanan, dan WhatsApp wajib diisi." });
    if (!persistentServicesConfigured) return res.json({ message: "Listing tersimpan dalam mode demo" });
    if (res.locals.appRole !== "driver" || res.locals.driverStatus !== "approved") {
      return res.status(403).json({ error: "Hanya supir yang disetujui dapat membuat listing." });
    }
    const data = await upsertRentalListing(res.locals.userId, {
      title, description, serviceArea, whatsapp,
      mediaLinks: normalizeMediaLinks(mediaLinks),
      isAvailable,
    });
    return res.json({ message: "Listing sewa berhasil disimpan", data });
  }));

  // 6. Get all sewa requests
  app.get("/api/sewa", asyncHandler(async (req, res) => {
    if (persistentServicesConfigured) {
      const data = await loadRentals(res.locals.userId, res.locals.appRole);
      return res.json(data || []);
    }
    res.json(rentals);
  }));

  // 7. Create sewa request
  app.post("/api/sewa/create", asyncHandler(async (req, res) => {
    const { customerName, customerPhone, pickupLocation, destination, pickupDate, pickupTime, durationDays, passengersCount, note, routeCode } = req.body;

    if (!customerName || !customerPhone || !pickupLocation || !destination || !pickupDate || !pickupTime) {
      return res.status(400).json({ error: "Mohon isi semua field penting" });
    }

    const days = Number(durationDays) || 1;

    const newRequest: RentalRequest = {
      id: `rent-${Date.now()}`,
      customerName,
      customerPhone,
      pickupLocation,
      destination,
      pickupDate,
      pickupTime,
      durationDays: days,
      passengersCount: Number(passengersCount) || 1,
      note: note || "",
      status: "menunggu",
      routeCode: routeCode || "05",
      createdAt: new Date().toISOString()
    };

    if (res.locals.userId) {
      const persisted = await persistRental(res.locals.userId, {
        customerPhone, pickupLocation, destination,
        pickupAt: new Date(`${pickupDate}T${pickupTime}:00`).toISOString(),
        durationDays: days, passengersCount: Number(passengersCount) || 1,
        note, routeCode,
      });
      if (persisted) {
        newRequest.id = persisted.id;
        newRequest.createdAt = persisted.created_at;
      }
    }

    rentals.unshift(newRequest); // Add to beginning
    res.json({ message: "Permintaan Sewa Angkot berhasil dikirim", data: newRequest });
  }));

  // 8. Update sewa status
  app.post("/api/sewa/update-status", asyncHandler(async (req, res) => {
    const { id, status } = req.body; // "disetujui" or "ditolak"

    if (!id || !["disetujui", "ditolak", "menunggu"].includes(status)) {
      return res.status(400).json({ error: "ID atau Status tidak valid" });
    }

    if (persistentServicesConfigured && res.locals.appRole !== "admin") {
      return res.status(403).json({ error: "Hanya admin yang dapat mengubah status sewa." });
    }
    if (res.locals.userId && status !== "menunggu") {
      await persistRentalStatus(id, status === "disetujui" ? "approved" : "rejected");
      return res.json({ message: `Status sewa berhasil diubah menjadi ${status}` });
    }

    const request = rentals.find(r => r.id === id);
    if (!request) {
      return res.status(404).json({ error: "Permintaan sewa tidak ditemukan" });
    }

    request.status = status;
    res.json({ message: `Status sewa berhasil diubah menjadi ${status}`, data: request });
  }));


  // --- VITE DEV / PRODUCTION MIDDLEWARE ---

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("API error:", error);
    const message = error instanceof Error ? error.message : "Terjadi kesalahan pada server.";
    res.status(500).json({ error: message });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Serve index.html for undefined routes (SPA behavior)
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[OK] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Critical server error:", err);
});
