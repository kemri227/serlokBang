import React, { useState, useEffect, useRef, useCallback } from "react";
import { Angkot, Passenger, RentalListing } from "./types.js";
import CityMap from "./components/CityMap.js";
import AdminDriverApprovals from "./components/AdminDriverApprovals.js";
import { getCurrentCoordinates } from "./lib/utils.js";
import { apiFetch } from "./lib/api.js";
import { supabase } from "./lib/supabase.js";
import { nearbyTrackingTopics } from "./lib/trackingTopics.js";
import { useAuth } from "./auth/AuthContext.js";
import {
  MapPin,
  Navigation,
  User,
  Users,
  Phone,
  Plus,
  Trash,
  Check,
  X,
  Calendar,
  Clock,
  Sparkles,
  Filter,
  Info,
  List,
  AlertCircle,
  ThumbsUp,
  CheckCircle,
  ToggleLeft,
  ChevronRight,
  RefreshCw,
  Search,
  CheckSquare,
  XSquare,
  HelpCircle,
  LogOut,
  ExternalLink,
} from "lucide-react";

export default function App() {
  const { profile, signOut } = useAuth();
  const [shareClientId] = useState(() => {
    const saved = localStorage.getItem("share_client_id");
    if (saved) return saved;
    const created = crypto.randomUUID();
    localStorage.setItem("share_client_id", created);
    return created;
  });
  const [colorScheme, setColorScheme] = useState<"light" | "dark">(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );
  const [selectedRole, setSelectedRole] = useState<"passenger" | "driver" | "admin">("passenger");
  const [activeTab, setActiveTab] = useState<"tracking" | "sewa">("tracking");
  const [sewaFilterQuery, setSewaFilterQuery] = useState<string>("");
  const [showAdminPanel, setShowAdminPanel] = useState<boolean>(true);
  
  // Data State fetched from server
  const [angkots, setAngkots] = useState<Angkot[]>([]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [rentalListings, setRentalListings] = useState<RentalListing[]>([]);
  const [listingTitle, setListingTitle] = useState("Sewa angkot");
  const [listingArea, setListingArea] = useState("");
  const [listingDescription, setListingDescription] = useState("");
  const [listingMediaLinks, setListingMediaLinks] = useState("");
  const [listingSaving, setListingSaving] = useState(false);
  
  // Interaction Filters
  const [activeRouteFilter, setActiveRouteFilter] = useState<string>("all");
  const [selectedAngkotId, setSelectedAngkotId] = useState<string | null>(null);
  const [selectedMapCoords, setSelectedMapCoords] = useState<{ lat: number; lng: number } | null>(null);
  const nearbyOriginRef = useRef<{ lat: number; lng: number } | null>((() => {
    try {
      return JSON.parse(localStorage.getItem("last_known_coords") || "null");
    } catch {
      return null;
    }
  })());
  const [realtimeOrigin, setRealtimeOrigin] = useState<{ lat: number; lng: number } | null>(nearbyOriginRef.current);
  const handleLocationResolved = useCallback((coords: { lat: number; lng: number }) => {
    nearbyOriginRef.current = coords;
    setRealtimeOrigin(coords);
    localStorage.setItem("last_known_coords", JSON.stringify(coords));
  }, []);

  // Active Passenger Registration / Session State
  const [currentPassengerId, setCurrentPassengerId] = useState<string | null>(() => {
    return typeof window !== "undefined" ? localStorage.getItem("current_pax_id") || null : null;
  });
  const [paxFormName, setPaxFormName] = useState<string>("");
  const [paxFormPhone, setPaxFormPhone] = useState<string>("");
  const [paxFormDest, setPaxFormDest] = useState<string>("");
  const [paxFormRoute, setPaxFormRoute] = useState<string>("05");

  // Active Driver Operation State
  const [currentDriverId, setCurrentDriverId] = useState<string | null>(() => {
    return typeof window !== "undefined" ? localStorage.getItem("current_driver_id") || null : null;
  });
  const [showPaxForm, setShowPaxForm] = useState<boolean>(false);
  const [isDriverRegisterMode, setIsDriverRegisterMode] = useState<boolean>(false);

  // Driver Reg Form
  const [newDriverName, setNewDriverName] = useState("");
  const [newPlateNumber, setNewPlateNumber] = useState("");
  const [newRouteCode, setNewRouteCode] = useState("lainnya");
  const [newRouteName, setNewRouteName] = useState("");
  const [newDriverPhone, setNewDriverPhone] = useState("");
  const [driverUpdating, setDriverUpdating] = useState<boolean>(false);
  const [isHubExpanded, setIsHubExpanded] = useState(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);

  useEffect(() => {
    if (!profile) return;
    setSelectedRole(profile.role === "admin" ? "admin" : profile.role === "driver" ? "driver" : "passenger");
    setNewDriverName((current) => current || profile.full_name || "");
    setNewDriverPhone((current) => current || profile.whatsapp || "");
  }, [profile?.role]);

  // Keep the entire interface (including MapLibre's base map) in sync with
  // the gadget's native appearance setting. There is intentionally no saved
  // override, so changing the OS theme is reflected immediately.
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = (isDark: boolean) => {
      const nextTheme = isDark ? "dark" : "light";
      setColorScheme(nextTheme);
      document.documentElement.classList.toggle("dark", isDark);
      document.documentElement.classList.toggle("light", !isDark);
      document.documentElement.style.colorScheme = nextTheme;
    };

    syncTheme(query.matches);
    const handleChange = (event: MediaQueryListEvent) => syncTheme(event.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  // Rental (Sewa) Form / Modal State
  const [showSewaModal, setShowSewaModal] = useState<boolean>(false);
  const [sewaName, setSewaName] = useState<string>("");
  const [sewaPhone, setSewaPhone] = useState<string>("");
  const [sewaPickup, setSewaPickup] = useState<string>("");
  const [sewaDest, setSewaDest] = useState<string>("");
  const [sewaDate, setSewaDate] = useState<string>("");
  const [sewaTime, setSewaTime] = useState<string>("08:00");
  const [sewaDays, setSewaDays] = useState<number>(1);
  const [sewaPaxCount, setSewaPaxCount] = useState<number>(10);
  const [sewaNote, setSewaNote] = useState<string>("");
  const [sewaRouteCode, setSewaRouteCode] = useState<string>("05");
  const [rentResultMsg, setRentResultMsg] = useState<string>("");

  // Fetch all states from the local Node fullstack API
  const refreshAllData = async () => {
    try {
      const origin = nearbyOriginRef.current;
      const nearbyParams = origin
        ? `?nearby=1&lat=${origin.lat}&lng=${origin.lng}&radius=10&limit=50`
        : "?nearby=1&limit=50";
      const rAngkots = await apiFetch(`/api/angkots${nearbyParams}`);
      const dAngkots = await rAngkots.json();
      setAngkots(dAngkots);

      const rPassengers = await apiFetch(`/api/passengers${nearbyParams}`);
      const dPassengers = await rPassengers.json();
      setPassengers(dPassengers);

      setLoading(false);
    } catch (err) {
      console.error("Gagal menjangkau server API:", err);
    }
  };

  useEffect(() => {
    refreshAllData();
    // Slow recovery snapshot only; normal updates arrive through Realtime Broadcast.
    const interval = setInterval(() => {
      refreshAllData();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!supabase || !realtimeOrigin) return;
    const kinds: Array<"vehicle" | "passenger"> = selectedRole === "admin"
      ? ["vehicle", "passenger"]
      : [selectedRole === "driver" ? "passenger" : "vehicle"];
    const channels = kinds.flatMap((kind) => nearbyTrackingTopics(kind, realtimeOrigin.lat, realtimeOrigin.lng)).map((topic) => {
      const channel = supabase.channel(topic);
      channel.on("broadcast", { event: "location_changed" }, (message) => {
        const update = message.payload as Record<string, any>;
        if (!update?.id || !update?.kind) return;
        if (update.kind === "vehicle") {
          setAngkots((current) => update.removed
            ? current.filter((item) => item.id !== update.id)
            : [...current.filter((item) => item.id !== update.id), {
                id: update.id, driverName: update.driverName || "Supir", plateNumber: update.plateNumber,
                routeCode: update.routeCode || "lainnya", routeName: update.routeName || "Rute lainnya",
                color: update.color || "#64748b", lat: Number(update.lat), lng: Number(update.lng),
                status: update.status || "aktif", lastUpdated: update.lastUpdated || new Date().toISOString(),
                kapasitas: Number(update.kapasitas || 12), penumpangAktif: Number(update.penumpangAktif || 0),
              } as Angkot]);
        } else if (update.kind === "passenger") {
          setPassengers((current) => update.removed
            ? current.filter((item) => item.id !== update.id)
            : [...current.filter((item) => item.id !== update.id), {
                id: update.id, name: update.name || "Penumpang", phone: "",
                routeCode: update.routeCode || "lainnya", destination: update.destination || "Menunggu angkot",
                lat: Number(update.lat), lng: Number(update.lng), status: "menunggu",
                lastUpdated: update.lastUpdated || new Date().toISOString(),
              } as Passenger]);
        }
      }).subscribe();
      return channel;
    });
    return () => {
      channels.forEach((channel) => { supabase.removeChannel(channel); });
    };
  }, [realtimeOrigin?.lat, realtimeOrigin?.lng, selectedRole]);

  const loadRentalListings = useCallback(async () => {
    try {
      const response = await apiFetch("/api/rental-listings?limit=24");
      if (response.ok) setRentalListings(await response.json());
    } catch (error) {
      console.error("Gagal memuat katalog sewa:", error);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "sewa") loadRentalListings();
  }, [activeTab, loadRentalListings]);

  // Sync Form inputs if Passenger Session exists in localStorage
  useEffect(() => {
    if (currentPassengerId) {
      const activePax = passengers.find(p => p.id === currentPassengerId);
      if (activePax) {
        setPaxFormName(activePax.name);
        setPaxFormPhone(activePax.phone);
        setPaxFormDest(activePax.destination);
        setPaxFormRoute(activePax.routeCode);
      }
    }
  }, [currentPassengerId, passengers]);

  // Handle map click selection
  const handleMapClick = (lat: number, lng: number) => {
    setSelectedMapCoords({ lat, lng });
  };

  const handleRegisterPassengerDirectly = async () => {
    setIsLocating(true);
    try {
      // Automatic location detection like GMap sharelok
      const coords = await getCurrentCoordinates();
      nearbyOriginRef.current = coords;
      setRealtimeOrigin(coords);
      localStorage.setItem("last_known_coords", JSON.stringify(coords));
      if (navigator.vibrate) navigator.vibrate(50);

      const response = await apiFetch("/api/passengers/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: currentPassengerId,
          clientKey: shareClientId,
          name: "Penumpang",
          phone: "08123456789",
          lat: coords.lat,
          lng: coords.lng,
          destination: "Menunggu Angkot",
          routeCode: activeRouteFilter === "all" ? "lainnya" : activeRouteFilter
        }),
      });
      const resData = await response.json();
      if (!response.ok) {
        alert(resData.error || "Lokasi belum dapat dibagikan.");
        return;
      }
      if (resData && resData.data) {
        setCurrentPassengerId(resData.data.id);
        localStorage.setItem("current_pax_id", resData.data.id);
        setSelectedMapCoords(null);
        refreshAllData();
        alert("📍 Lokasi Anda berhasil di-share ke radar! Supir bisa melihat posisi penjemputan Anda.");
      }
    } catch (err) {
      console.error(err);
      alert("Gagal mendapatkan lokasi. Pastikan izin GPS aktif.");
    } finally {
      setIsLocating(false);
    }
  };

  // --- PASSENGER OPERATIONS ---
  const handleRegisterPassenger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paxFormName || !paxFormPhone || !paxFormDest) {
      alert("Mohon lengkapi Nama, No HP, dan Tujuan menjemput!");
      return;
    }

    // Default coordinate if they haven't tapped the map yet
    let finalLat = -6.9005;
    let finalLng = 107.6185;
    if (selectedMapCoords) {
      finalLat = selectedMapCoords.lat;
      finalLng = selectedMapCoords.lng;
    } else {
      alert("Tips: Silakan klik atau sentuh area mana saja di jalan PETA sebelah kiri untuk menandai koordinat penjemputan Anda yang akurat!");
    }

    try {
      const response = await apiFetch("/api/passengers/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: currentPassengerId,
          clientKey: shareClientId,
          name: paxFormName,
          phone: paxFormPhone,
          lat: finalLat,
          lng: finalLng,
          destination: paxFormDest,
          routeCode: paxFormRoute
        }),
      });
      const resData = await response.json();
      if (resData && resData.data) {
        setCurrentPassengerId(resData.data.id);
        localStorage.setItem("current_pax_id", resData.data.id);
        setSelectedMapCoords(null);
        refreshAllData();
        alert("📍 Posisi & permohonan jemput Anda berhasil dikirim! Supir terdekat akan diberitahu koordinat Anda.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Passenger resolving status (Sudah naik or Batal)
  const handleUpdatePassengerStatus = async (status: "sudah_naik" | "batal") => {
    if (!currentPassengerId) return;
    try {
      await apiFetch("/api/passengers/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentPassengerId, status, ...nearbyOriginRef.current }),
      });
      
      if (status === "batal" || status === "sudah_naik") {
        setCurrentPassengerId(null);
        localStorage.removeItem("current_pax_id");
        setPaxFormDest("");
        setSelectedMapCoords(null);
      }
      refreshAllData();
      alert(
        status === "sudah_naik" 
          ? "🎉 Selamat jalan! Koordinat Anda dihapus otomatis dari peta karena Anda sudah naik." 
          : "🚫 Penjemputan dibatalkan. Koordinat Anda telah dihapus dari peta."
      );
    } catch (err) {
      console.error(err);
    }
  };

  // --- DRIVER PORTS OPERATIONS ---
  const handleDriverUpdatePosition = async (angkotId: string) => {
    setIsLocating(true);
    try {
      const coords = await getCurrentCoordinates();
      nearbyOriginRef.current = coords;
      setRealtimeOrigin(coords);
      localStorage.setItem("last_known_coords", JSON.stringify(coords));
      if (navigator.vibrate) navigator.vibrate(50);

      const currentDriverObj = angkots.find(a => a.id === angkotId);
      if (!currentDriverObj) return;
      const res = await apiFetch("/api/angkots/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: angkotId,
          clientKey: shareClientId,
          driverName: currentDriverObj.driverName,
          plateNumber: currentDriverObj.plateNumber,
          routeCode: currentDriverObj.routeCode,
          lat: coords.lat,
          lng: coords.lng,
          status: currentDriverObj.status,
          penumpangAktif: currentDriverObj.penumpangAktif
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        alert(result.error || "Lokasi belum dapat dibagikan.");
        return;
      }
      refreshAllData();
      alert("📍 Posisi jalan Anda berhasil diperbarui di radar!");
      return result;
    } catch (e) {
      console.error(e);
      alert("Gagal memperbarui lokasi supir.");
    } finally {
      setIsLocating(false);
    }
  };

  const handleDriverUpdateStatus = async (angkotId: string, status: "aktif" | "tidak_aktif", penumpangAktif: number) => {
    try {
      const res = await apiFetch("/api/angkots/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: angkotId, status, penumpangAktif }),
      });
      return await res.json();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRegisterNewDriver = async (driverName: string, plateNumber: string, routeCode: string, lat: number, lng: number, routeName: string, driverPhone: string) => {
    try {
      const res = await apiFetch("/api/angkots/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverName,
          plateNumber,
          routeCode,
          routeName,
          driverPhone,
          lat,
          lng,
          status: "aktif",
          penumpangAktif: 0
        }),
      });
      return await res.json();
    } catch (e) {
      console.error(e);
    }
  };

  // --- SEWA (RENTAL) OPERATIONS ---
  const handleCreateSewaRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sewaName || !sewaPhone || !sewaPickup || !sewaDest || !sewaDate) {
      alert("Harap lengkapi semua isian formulir sewa angkot!");
      return;
    }

    try {
      const response = await apiFetch("/api/sewa/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: sewaName,
          customerPhone: sewaPhone,
          pickupLocation: sewaPickup,
          destination: sewaDest,
          pickupDate: sewaDate,
          pickupTime: sewaTime,
          durationDays: sewaDays,
          passengersCount: sewaPaxCount,
          note: sewaNote,
          routeCode: sewaRouteCode
        }),
      });

      const resData = await response.json();
      if (resData && resData.data) {
        setRentResultMsg("Sukses! Penawaran Sewa Angkot Anda telah terdaftar.");
        setTimeout(() => {
          setRentResultMsg("");
          setShowSewaModal(false);
          // Reset form fields
          setSewaPickup("");
          setSewaDest("");
          setSewaNote("");
        }, 2000);
        refreshAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Admin approves/declines rentals
  const handleUpdateSewaStatus = async (id: string, status: "disetujui" | "ditolak") => {
    try {
      await apiFetch("/api/sewa/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      refreshAllData();
    } catch (err) {
      console.error(err);
    }
  };

  // Passenger active status if they have configured it
  const hasActivePassenger = Boolean(currentPassengerId);
  const activeDriverObj = angkots.find((a) => a.id === (currentDriverId || selectedAngkotId)) || angkots[0];
  const availableRoutes = Array.from(
    new Map(angkots.map((angkot) => [angkot.routeCode, angkot.routeName || `Trayek ${angkot.routeCode}`])).entries()
  ).map(([code, name]) => ({ code, name }));
  const availableRoleOptions = profile?.role === "admin"
    ? [{ id: "admin", icon: "🛡️", label: "Admin" }]
    : profile?.role === "driver"
      ? [
          { id: "passenger", icon: "🚶", label: "User" },
          { id: "driver", icon: "👨‍✈️", label: "Driver" },
        ]
      : [{ id: "passenger", icon: "🚶", label: "User" }];

  return (
    <div className="app-shell h-screen w-screen bg-[#FDFCF8] dark:bg-slate-950 text-[#3E3A31] dark:text-slate-100 font-sans antialiased overflow-hidden selection:bg-[#7A8D6E]/30 selection:text-[#3E3A31] dark:selection:text-white">
      
      {/* FLOATING HEADER PANEL (TOP) */}
      <header className="fixed top-4 md:top-6 left-4 md:left-6 right-4 md:right-6 z-40 pointer-events-none flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4">
        <div className="flex items-center gap-3 md:gap-4 pointer-events-auto bg-white/95 backdrop-blur-xl px-4 md:px-5 py-2 md:py-3 rounded-[2.5rem] shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white/50 animate-fade-in-down">
          <div className="bg-[#7A8D6E] p-2 md:p-2.5 rounded-2xl shadow-lg shadow-[#7A8D6E]/30 text-white">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-1.1 0-2 .9-2 2v7c0 1.1.9 2 2 2h10" />
              <circle cx="7" cy="17" r="2" />
              <circle cx="17" cy="17" r="2" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-800 flex items-center gap-2 leading-none">
              AngkotTrack
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">PRO</span>
            </h1>
            <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mt-1">Radar Angkot Multi-Kota</p>
          </div>
          <button onClick={signOut} title="Keluar" aria-label="Keluar" className="ml-1 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors">
            <LogOut size={14} />
          </button>
        </div>

        {/* Tab Switcher (Floating) */}
        <div className="pointer-events-auto bg-white/90 backdrop-blur-xl p-1 md:p-1.5 rounded-full shadow-2xl border border-white/50 flex items-center gap-1 animate-fade-in-down">
          <button
            onClick={() => setActiveTab("tracking")}
            className={`px-4 md:px-6 py-2 md:py-2.5 text-[10px] md:text-sm font-black rounded-full transition-all flex items-center gap-2 ${
              activeTab === "tracking"
                ? "bg-[#7A8D6E] text-white shadow-lg shadow-[#7A8D6E]/40"
                : "text-slate-600 hover:bg-slate-100/50"
            }`}
          >
            <span>MAP</span>
          </button>
          <button
            onClick={() => setActiveTab("sewa")}
            className={`px-6 py-2.5 text-xs md:text-sm font-bold rounded-full transition-all flex items-center gap-2 ${
              activeTab === "sewa"
                ? "bg-[#7A8D6E] text-white shadow-lg shadow-[#7A8D6E]/40"
                : "text-slate-600 hover:bg-slate-100/50"
            }`}
          >
            <span>CHARTER</span>
          </button>
        </div>
      </header>

      {/* FLOATING STATS HUD (BOTTOM LEFT) */}
      {activeTab === "tracking" && (
        <div className="fixed bottom-6 md:bottom-8 left-4 md:left-8 z-30 pointer-events-none animate-fade-in-up md:block hidden">
          <div className="pointer-events-auto bg-slate-900/95 backdrop-blur-2xl px-5 md:px-6 py-4 md:py-5 rounded-[2rem] md:rounded-[2.5rem] shadow-2xl border border-white/10 text-white min-w-[240px] md:min-w-[280px]">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[10px] font-black tracking-widest text-slate-400 uppercase">System Status</h3>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[10px] font-bold text-emerald-400 tracking-wider">ONLINE</span>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 rounded-2xl text-emerald-400 group-hover:scale-110 transition-transform">
                    <Navigation size={14} />
                  </div>
                  <span className="text-xs font-bold text-slate-300">Active Fleet</span>
                </div>
                <span className="text-lg font-black font-mono">{angkots.filter(a => a.status === "aktif").length}</span>
              </div>
              
              <div className="flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-orange-500/10 rounded-2xl text-orange-400 group-hover:scale-110 transition-transform">
                    <Users size={14} />
                  </div>
                  <span className="text-xs font-bold text-slate-300">Queueing</span>
                </div>
                <span className="text-lg font-black font-mono">{passengers.filter(p => p.status === "menunggu").length}</span>
              </div>
            </div>

            <button
              onClick={refreshAllData}
              className="w-full mt-6 py-3.5 bg-white/5 hover:bg-white/10 rounded-[1.5rem] flex items-center justify-center gap-2 text-[10px] font-bold tracking-[0.2em] text-white transition-all border border-white/5 uppercase"
            >
              <RefreshCw size={12} className="text-[#7A8D6E]" />
              Sync Realtime Data
            </button>
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="w-full h-full relative">
        {activeTab === "tracking" ? (
          <div className="w-full h-full relative animate-fade-in bg-slate-100">
            <CityMap
              theme={colorScheme}
              angkots={angkots}
              passengers={passengers}
              selectedRole={selectedRole}
              activeRouteFilter={activeRouteFilter}
              onMapClick={handleMapClick}
              selectedCoordinates={selectedMapCoords}
              selectedAngkotId={selectedAngkotId}
              onSelectAngkot={(id) => setSelectedAngkotId(id)}
              currentPassengerId={currentPassengerId}
              onLocationResolved={handleLocationResolved}
            />

            {selectedRole === "driver" && !activeDriverObj && profile?.role === "driver" && (
              <div className="absolute inset-0 z-30 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4">
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    setDriverUpdating(true);
                    try {
                      const coords = await getCurrentCoordinates();
                      const result = await handleRegisterNewDriver(
                        newDriverName || profile.full_name || "Supir",
                        newPlateNumber.toUpperCase(),
                        newRouteCode,
                        coords.lat,
                        coords.lng,
                        newRouteName,
                        newDriverPhone || profile.whatsapp || "",
                      );
                      if (result?.data?.id) {
                        setCurrentDriverId(result.data.id);
                        localStorage.setItem("current_driver_id", result.data.id);
                        nearbyOriginRef.current = coords;
                        setRealtimeOrigin(coords);
                        await refreshAllData();
                      }
                    } finally { setDriverUpdating(false); }
                  }}
                  className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl p-6 space-y-4"
                >
                  <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white">Daftarkan angkot</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Akun supir sudah disetujui. Lengkapi armada sebelum membagikan lokasi.</p>
                  </div>
                  <input required value={newDriverName} onChange={(e) => setNewDriverName(e.target.value)} placeholder={profile.full_name || "Nama supir"} className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                  <input required value={newPlateNumber} onChange={(e) => setNewPlateNumber(e.target.value)} placeholder="Plat nomor" className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 uppercase" />
                  <div className="grid grid-cols-2 gap-3">
                    <input required value={newRouteCode} onChange={(e) => setNewRouteCode(e.target.value)} placeholder="Kode trayek" className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                    <input required value={newRouteName} onChange={(e) => setNewRouteName(e.target.value)} placeholder="Nama trayek" className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                  </div>
                  <input required inputMode="tel" value={newDriverPhone} onChange={(e) => setNewDriverPhone(e.target.value)} placeholder={profile.whatsapp || "Nomor WhatsApp"} className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                  <button disabled={driverUpdating} className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black disabled:opacity-50">
                    {driverUpdating ? "Mendaftarkan…" : "Daftarkan & bagikan lokasi"}
                  </button>
                </form>
              </div>
            )}

            {/* FLOATING BLOCK 1: ROLE SWITCHER & ROUTE FILTER (TOP RIGHT) */}
            <div className="absolute top-20 md:top-24 right-4 md:right-8 z-40 flex flex-col gap-3 md:gap-5 max-w-[140px] xs:max-w-[180px] md:max-w-[240px]">
              {/* Role Card - Simplified on small screens */}
              <div className="bg-white/95 backdrop-blur-xl p-2 md:p-5 rounded-[1.5rem] md:rounded-[2.5rem] shadow-2xl border border-white/50 text-slate-800">
                <div className="text-[7px] md:text-[9px] font-black text-slate-400 mb-2 md:mb-4 px-1 md:px-2 uppercase tracking-[0.2em] flex items-center justify-between">
                  <span>Role</span>
                  <User size={8} className="md:size-3" />
                </div>
                <div className="flex flex-col gap-1.5 md:gap-2">
                  {availableRoleOptions.map((role) => (
                    <button
                      key={role.id}
                      onClick={() => {
                        setSelectedRole(role.id as any);
                        setSelectedAngkotId(null);
                        setIsHubExpanded(false);
                      }}
                      className={`group py-2 md:py-3 px-2 md:px-5 text-left text-[9px] md:text-xs font-black rounded-lg md:rounded-2xl transition-all flex items-center justify-between ${
                        selectedRole === role.id
                          ? "bg-[#7A8D6E] text-white shadow-lg shadow-[#7A8D6E]/30"
                          : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 md:gap-3">
                        <span className="text-xs md:text-lg leading-none">{role.icon}</span>
                        <span className="hidden sm:inline">{role.label}</span>
                      </span>
                      {selectedRole === role.id && <CheckCircle size={12} className="text-white/80 md:block hidden" />}
                    </button>
                  ))}
                </div>
              </div>

              {profile?.requested_role === "driver" && profile.driver_status === "pending" && (
                <div className="bg-amber-50/95 dark:bg-amber-950/80 backdrop-blur-xl p-3 rounded-2xl shadow-xl border border-amber-200 dark:border-amber-800 text-[9px] font-bold text-amber-800 dark:text-amber-200 leading-relaxed">
                  Pendaftaran supir sedang menunggu persetujuan admin. Sementara ini akun tetap sebagai penumpang.
                </div>
              )}

              {/* Route Filter Card - Minimal on mobile */}
              {selectedRole !== "driver" && (
                <div className="bg-slate-900/95 backdrop-blur-xl p-2 md:p-5 rounded-[1.5rem] md:rounded-[2.5rem] shadow-2xl border border-white/10 text-white animate-fade-in-scale">
                  <div className="text-[7px] md:text-[9px] font-black text-slate-400 mb-1 md:mb-4 px-1 md:px-2 uppercase tracking-[0.2em] flex items-center justify-between">
                    <span>Route</span>
                    <Filter size={8} className="md:size-3" />
                  </div>
                  <div className="relative">
                    <select
                      value={activeRouteFilter}
                      onChange={(e) => setActiveRouteFilter(e.target.value)}
                      className="w-full bg-white/5 appearance-none font-black px-3 md:px-5 py-2 md:py-4 rounded-lg md:rounded-2xl border border-white/10 text-white outline-none text-[8px] md:text-[11px] cursor-pointer hover:bg-white/10 transition-colors"
                    >
                      <option value="all" className="bg-slate-900">All</option>
                      {availableRoutes.map((r) => (
                        <option key={r.code} value={r.code} className="bg-slate-900">
                          {r.code} • {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* FLOWER FAB / SPEED DIAL */}
            {selectedRole !== "admin" && (
            <div className="fixed z-50 bottom-6 left-6 md:left-[22rem]">
              <div className="relative w-16 h-16">
                <div className={`absolute inset-0 transition-opacity duration-200 ${isHubExpanded ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                  {selectedRole === "passenger" && hasActivePassenger && (
                    <>
                      <button
                        aria-label="Saya sudah naik angkot"
                        title="Saya sudah naik angkot"
                        onClick={() => { handleUpdatePassengerStatus("sudah_naik"); setIsHubExpanded(false); }}
                        className="flower-action -translate-y-[5rem] bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <CheckCircle size={21} />
                        <span className="flower-label">Sudah naik</span>
                      </button>
                      <button
                        aria-label="Batalkan permintaan"
                        title="Batalkan permintaan"
                        onClick={() => { handleUpdatePassengerStatus("batal"); setIsHubExpanded(false); }}
                        className="flower-action translate-x-[4.75rem] -translate-y-[2.5rem] bg-red-600 hover:bg-red-700 text-white"
                      >
                        <Trash size={20} />
                        <span className="flower-label">Batalkan</span>
                      </button>
                    </>
                  )}

                  {selectedRole === "driver" && activeDriverObj && (
                    <>
                      <button
                        aria-label="Tandai angkot tersedia"
                        title="Tandai angkot tersedia"
                        disabled={driverUpdating}
                        onClick={async () => {
                          setDriverUpdating(true);
                          await handleDriverUpdateStatus(activeDriverObj.id, "aktif", 0);
                          setDriverUpdating(false);
                          refreshAllData();
                          setIsHubExpanded(false);
                        }}
                        className="flower-action -translate-y-[5rem] bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <CheckCircle size={21} />
                        <span className="flower-label">Tersedia</span>
                      </button>
                      <button
                        aria-label="Tandai angkot penuh"
                        title="Tandai angkot penuh"
                        disabled={driverUpdating}
                        onClick={async () => {
                          setDriverUpdating(true);
                          await handleDriverUpdateStatus(activeDriverObj.id, "aktif", 12);
                          setDriverUpdating(false);
                          refreshAllData();
                          setIsHubExpanded(false);
                        }}
                        className="flower-action translate-x-[4.75rem] -translate-y-[2.5rem] bg-amber-600 hover:bg-amber-700 text-white"
                      >
                        <Users size={21} />
                        <span className="flower-label">Penuh</span>
                      </button>
                    </>
                  )}
                </div>

                <button
                  onClick={async () => {
                    if (isLocating || driverUpdating) return;
                    setIsHubExpanded(false);

                    if (selectedRole === "passenger") {
                      await handleRegisterPassengerDirectly();
                      setIsHubExpanded(true);
                    } else if (selectedRole === "driver" && activeDriverObj) {
                      setDriverUpdating(true);
                      await handleDriverUpdatePosition(activeDriverObj.id);
                      setDriverUpdating(false);
                      setIsHubExpanded(true);
                    }
                  }}
                  disabled={isLocating || driverUpdating}
                  aria-expanded={isHubExpanded}
                  aria-label={selectedRole === "driver" ? "Bagikan lokasi supir" : "Bagikan lokasi saya"}
                  className={`relative group w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90 border-4 border-white dark:border-slate-800 ${
                    isHubExpanded 
                      ? "bg-blue-600 text-white" 
                      : (hasActivePassenger ? "bg-orange-500 text-white" : "bg-[#7A8D6E] text-white")
                  }`}
                >
                  {isLocating || driverUpdating ? <RefreshCw size={25} className="animate-spin" /> : <MapPin size={27} className="fill-current" />}
                  
                  {/* Label Tooltip (Desktop only) - Moved to right side since FAB is on left */}
                  {!isHubExpanded && !isLocating && !driverUpdating && (
                    <div className="absolute left-full ml-4 bg-white dark:bg-slate-900 px-4 py-2 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 hidden md:flex items-center pointer-events-none transition-opacity group-hover:opacity-100 opacity-0 whitespace-nowrap">
                      <span className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest">
                        {hasActivePassenger ? "Atur lokasi" : (selectedRole === "driver" ? "Lokasi supir" : "Bagikan lokasi")}
                      </span>
                    </div>
                  )}
                </button>
              </div>
            </div>
            )}

            {/* FLOATING ACTION PANELS (TOP LEFT - ADMIN ONLY) */}
            {selectedRole === "admin" && (
              <div className="absolute top-20 md:top-24 left-4 md:left-8 z-40 max-w-[240px] md:max-w-[340px] pointer-events-none w-full">
                <div className="pointer-events-auto">
                  <div className="bg-white/95 backdrop-blur-xl p-5 md:p-7 rounded-[2rem] md:rounded-[3rem] shadow-[0_32px_64px_rgba(0,0,0,0.15)] border border-white flex flex-col gap-4 md:gap-6 animate-fade-in-left max-h-[60vh] md:max-h-[75vh] min-w-[280px] md:min-w-[320px] overflow-hidden">
                    <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                      <h3 className="text-xs font-black uppercase tracking-[0.25em] text-[#7A8D6E] flex items-center gap-4">
                        <div className="relative w-5 h-5">
                          <span className="absolute inset-0 bg-[#7A8D6E]/20 rounded-full animate-ping"></span>
                          <span className="absolute inset-2 bg-[#7A8D6E] rounded-full"></span>
                        </div>
                        Fleet Intelligence
                      </h3>
                    </div>

                    <div className="overflow-y-auto space-y-10 pr-3 custom-scrollbar">
                      <AdminDriverApprovals />
                      {/* Queue Section */}
                      <div>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-3">Live Feed <span className="bg-slate-100 text-slate-600 px-3 py-0.5 rounded-full text-[9px] font-mono">{passengers.length}</span></h4>
                        {passengers.length === 0 ? (
                          <div className="text-xs text-slate-400 italic py-8 text-center bg-slate-50/50 rounded-[2rem] border-2 border-dashed border-slate-100">Zero active requests.</div>
                        ) : (
                          <div className="space-y-4">
                            {passengers.map((pax) => (
                              <div key={pax.id} className="bg-slate-50 border border-slate-100 p-5 rounded-[2rem] flex justify-between items-center group hover:bg-white transition-all hover:shadow-xl">
                                <div>
                                  <div className="font-black text-slate-800 text-sm tracking-tight">{pax.name}</div>
                                  <div className="text-[10px] font-black text-[#7A8D6E] uppercase mt-1">➔ {pax.destination}</div>
                                </div>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100">
                                  <button
                                    onClick={async () => {
                                      await apiFetch(`/api/passengers/status`, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ id: pax.id, status: "sudah_naik" })
                                      });
                                      refreshAllData();
                                    }}
                                    className="p-3 bg-emerald-500/10 text-emerald-600 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all"
                                  >
                                    <Check size={16} />
                                  </button>
                                  <button
                                    onClick={async () => {
                                      await apiFetch(`/api/passengers/status`, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ id: pax.id, status: "batal" })
                                      });
                                      refreshAllData();
                                    }}
                                    className="p-3 bg-red-500/10 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition-all"
                                  >
                                    <Trash size={16} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full bg-[#FDFCF8] overflow-y-auto pt-24 md:pt-32 pb-24 md:pb-32 px-4 md:px-12">
            <div className="max-w-7xl mx-auto space-y-12 md:space-y-20 animate-fade-in-up">
              
              <div className="bg-[#7A8D6E] rounded-[3rem] md:rounded-[5rem] p-8 md:p-20 shadow-2xl flex flex-col lg:flex-row items-center justify-between gap-8 md:gap-12 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[20rem] md:w-[40rem] h-[20rem] md:h-[40rem] bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
                <div className="relative z-10 space-y-6 md:space-y-8 text-center lg:text-left">
                  <div className="inline-flex items-center gap-3 bg-white/20 backdrop-blur-md px-4 md:px-6 py-2 md:py-2.5 rounded-full text-[9px] md:text-[11px] font-black uppercase tracking-[0.3em]">
                    <Sparkles size={12} className="text-emerald-300" />
                    <span>Premium Directory</span>
                  </div>
                  <h2 className="text-4xl md:text-6xl font-black tracking-tighter leading-[0.95] max-w-2xl">
                    Reliable Drivers.<br />Seamless Charter.
                  </h2>
                  <p className="text-sm md:text-lg text-white/70 max-w-xl leading-relaxed font-bold italic">
                    Connect with verified operators for tourism, weddings, or corporate events.
                  </p>
                </div>
                <div className="relative z-10 flex flex-col items-center justify-center bg-white text-[#7A8D6E] w-48 h-48 md:w-64 md:h-64 rounded-full shadow-[0_0_100px_rgba(255,255,255,0.3)] border-[10px] md:border-[15px] border-white/20 scale-100 md:scale-125">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] mb-1">Fleet</div>
                  <div className="text-5xl md:text-7xl font-black font-mono tracking-tighter leading-none">{rentalListings.length}</div>
                  <div className="text-[10px] font-black uppercase mt-1">Cap. 12/pax</div>
                </div>
              </div>

              {profile?.role === "driver" && (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    setListingSaving(true);
                    try {
                      const response = await apiFetch("/api/rental-listings", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          title: listingTitle,
                          serviceArea: listingArea,
                          description: listingDescription,
                          whatsapp: profile.whatsapp,
                          mediaLinks: listingMediaLinks.split(/\r?\n/).map((link) => link.trim()).filter(Boolean).slice(0, 5),
                          isAvailable: true,
                        }),
                      });
                      const result = await response.json();
                      if (!response.ok) alert(result.error || "Listing gagal disimpan.");
                      else { alert("Listing sewa berhasil disimpan."); await loadRentalListings(); }
                    } finally { setListingSaving(false); }
                  }}
                  className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2rem] p-6 md:p-8 shadow-lg grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  <div className="md:col-span-2">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white">Listing penyewaan supir</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Data ini terpisah dari marker tracking dan tetap tampil saat Anda sedang offline.</p>
                  </div>
                  <input required value={listingTitle} onChange={(e) => setListingTitle(e.target.value)} placeholder="Judul layanan" className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                  <input required value={listingArea} onChange={(e) => setListingArea(e.target.value)} placeholder="Wilayah layanan, contoh: Kecamatan Cibiru" className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                  <input value={listingDescription} onChange={(e) => setListingDescription(e.target.value)} placeholder="Deskripsi layanan" className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                  <textarea value={listingMediaLinks} onChange={(e) => setListingMediaLinks(e.target.value)} rows={3} placeholder={'Tautan media, satu per baris (maks. 5)\nhttps://instagram.com/...\nhttps://drive.google.com/...'} className="md:col-span-2 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 resize-none" />
                  <button disabled={listingSaving} className="md:col-span-2 py-3.5 rounded-xl bg-[#7A8D6E] text-white font-black disabled:opacity-50">{listingSaving ? "Menyimpan…" : "Simpan listing sewa"}</button>
                </form>
              )}

              {/* Region check Proximity filtering box */}
              <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10">
                <div className="relative flex-1 group w-full">
                  <Search size={22} className="absolute left-6 md:left-10 top-1/2 -translate-y-1/2 text-[#7A8D6E]/40 group-focus-within:text-[#7A8D6E] transition-all" />
                  <input
                    type="text"
                    placeholder="Search by area, driver, or route..."
                    value={sewaFilterQuery}
                    onChange={(e) => setSewaFilterQuery(e.target.value)}
                    className="w-full text-base md:text-lg pl-16 md:pl-24 pr-8 md:pr-12 py-5 md:py-8 bg-white border border-slate-100 rounded-[2rem] md:rounded-[3rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-[8px] md:focus:ring-[12px] focus:ring-[#7A8D6E]/5 transition-all font-black placeholder:text-slate-300"
                  />
                </div>
                <div className="px-8 py-3 bg-[#7A8D6E]/5 rounded-full text-[10px] font-black text-[#7A8D6E] tracking-[0.2em] whitespace-nowrap">
                  {sewaFilterQuery ? `MATCHING: ${sewaFilterQuery.toUpperCase()}` : "READY FOR DEPLOYMENT"}
                </div>
              </div>

              {/* Dynamic Driver Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 pb-24">
                {(() => {
                  const query = sewaFilterQuery.toLowerCase().trim();
                  const filteredDrivers = rentalListings.filter(a => {
                    if (!query) return true;
                    return (
                      a.driverName.toLowerCase().includes(query) ||
                      a.routeName.toLowerCase().includes(query) ||
                      a.routeCode.toLowerCase().includes(query) ||
                      a.plateNumber.toLowerCase().includes(query) ||
                      a.serviceArea.toLowerCase().includes(query)
                    );
                  });

                  if (filteredDrivers.length === 0) {
                    return (
                      <div className="col-span-full py-48 text-center flex flex-col items-center gap-10 bg-slate-50 rounded-[4rem] border-4 border-dashed border-slate-200/50">
                        <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center">
                          <Search size={48} className="text-slate-300" />
                        </div>
                        <p className="text-xl font-black text-slate-400 tracking-tight">No matching fleets found.</p>
                      </div>
                    );
                  }

                  return filteredDrivers.map((angkot) => {
                    const phoneNum = angkot.driverPhone || "08123456789";
                    let cleanPhone = phoneNum.replace(/[^0-9]/g, "");
                    if (cleanPhone.startsWith("0")) cleanPhone = "62" + cleanPhone.slice(1);
                    const waText = encodeURIComponent(`Halo Mang/Kang ${angkot.driverName}, saya melihat info angkot Anda [Rute: ${angkot.routeName}, Plat: ${angkot.plateNumber}] di AngkotTrack. Saya berniat sewa/charter carteran rombongan.`);
                    const waUrl = `https://wa.me/${cleanPhone}?text=${waText}`;

                    return (
                      <div
                        key={angkot.id}
                        className="group bg-white border border-slate-50 rounded-[4rem] p-12 shadow-[0_20px_60px_rgba(0,0,0,0.03)] hover:shadow-[0_40px_100px_rgba(0,0,0,0.08)] hover:-translate-y-6 transition-all duration-500 flex flex-col gap-10"
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-3">
                            <span className="inline-block px-5 py-2 bg-emerald-50 text-emerald-600 text-[11px] font-black rounded-full tracking-[0.25em] uppercase">
                              Line {angkot.routeCode}
                            </span>
                            <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{angkot.driverName}</h3>
                          </div>
                          <div className="w-16 h-16 bg-slate-900 rounded-[1.75rem] flex items-center justify-center text-white font-mono text-[12px] font-black shadow-2xl group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
                            {angkot.plateNumber.split(" ")[0]}
                          </div>
                        </div>

                        <div className="space-y-6 text-base font-bold text-slate-500">
                          <div className="flex items-center gap-5">
                            <div className="w-12 h-12 rounded-3xl bg-[#7A8D6E]/5 flex items-center justify-center text-[#7A8D6E]">
                              <MapPin size={22} />
                            </div>
                            <span className="text-slate-600/80">{angkot.routeName}</span>
                          </div>
                          <div className="flex items-center gap-5">
                            <div className="w-12 h-12 rounded-3xl bg-[#7A8D6E]/5 flex items-center justify-center text-[#7A8D6E]">
                              <Navigation size={22} />
                            </div>
                            <span className="text-slate-600/80">{angkot.serviceArea}</span>
                          </div>
                          {angkot.description && <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{angkot.description}</p>}
                          {angkot.mediaLinks.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {angkot.mediaLinks.map((link, index) => (
                                <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-[10px] font-black text-slate-700 dark:text-slate-200 hover:bg-[#7A8D6E] hover:text-white transition-colors">
                                  <ExternalLink size={12} /> Media {index + 1}
                                </a>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-5">
                            <div className="w-12 h-12 rounded-3xl bg-[#7A8D6E]/5 flex items-center justify-center text-[#7A8D6E]">
                              <Users size={22} />
                            </div>
                            <span className="text-slate-600/80">Premium Group Seating</span>
                          </div>
                        </div>

                        <div className="flex gap-4 pt-6">
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 py-6 bg-[#7A8D6E] hover:bg-slate-900 text-white rounded-[2rem] text-center text-xs font-black shadow-2xl shadow-[#7A8D6E]/20 transition-all duration-500 flex items-center justify-center gap-4 uppercase tracking-[0.2em]"
                          >
                            <Phone size={16} />
                            <span>Contact Operator</span>
                          </a>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              <div className="max-w-5xl mx-auto p-12 bg-amber-50 rounded-[4rem] border border-amber-100 text-xs text-amber-800/50 leading-relaxed font-bold flex items-start gap-8">
                <AlertCircle size={40} className="text-amber-400 shrink-0" />
                <p>
                  <strong>Transparency Protocol:</strong> AngkotTrack operates as a zero-commission directory. All financial transactions, scheduling, and service terms are negotiated <strong>directly and transparently</strong> between the client and the operator. We do not participate in or process payments.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* CHARTER BOOKING INFO MODAL (REUSED) */}
      {activeTab === "sewa" && (
        <footer className="bg-white border-t border-slate-100 py-12 px-12 text-center">
          <p className="text-[10px] font-black text-[#7A8D6E] uppercase tracking-[0.4em] mb-3">&copy; 2026 AngkotTrack Pro • Multi-City Transit Network</p>
          <p className="text-[10px] text-slate-400 font-bold max-w-2xl mx-auto leading-relaxed">
            Revolutionizing local transit with high-fidelity tracking animations and smart fleet management.
          </p>
        </footer>
      )}

      {/* RENTAL (SEWA) MODAL WINDOW - STYLE REFINED */}
      {showSewaModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl z-[100] flex items-center justify-center p-6 animate-fade-in">
           <div className="bg-white rounded-[4rem] shadow-[0_48px_128px_rgba(0,0,0,0.2)] border border-white/50 max-w-2xl w-full overflow-hidden animate-fade-in-scale flex flex-col max-h-[95vh]">
              <div className="bg-[#7A8D6E] p-10 text-white flex items-center justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="relative z-10">
                  <h3 className="text-3xl font-black tracking-tighter mb-2">Service Request</h3>
                  <p className="text-[10px] text-white/60 font-black uppercase tracking-[0.3em]">Premium Fleet Deployment</p>
                </div>
                <button
                  onClick={() => setShowSewaModal(false)}
                  className="relative z-10 w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-all text-white backdrop-blur-md"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="p-10 text-center space-y-6">
                <div className="flex justify-center">
                   <div className="w-20 h-20 bg-emerald-50 text-[#7A8D6E] rounded-full flex items-center justify-center animate-bounce">
                      <Sparkles size={40} />
                   </div>
                </div>
                <h4 className="text-xl font-black text-slate-800 tracking-tight">Direct Booking Enabled</h4>
                <p className="text-xs text-slate-500 font-bold leading-relaxed px-10">
                  To ensure the fastest response, please contact the drivers directly via the <span className="text-[#7A8D6E]">WHATSAPP</span> buttons in the directory.
                </p>
                <button 
                  onClick={() => setShowSewaModal(false)}
                  className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all"
                >
                  Return to Directory
                </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
