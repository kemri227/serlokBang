import React, { useState, useEffect } from "react";
import { Angkot, RouteInfo, ROUTE_LIST } from "../types.js";
import { Send, User, ChevronRight, ToggleLeft, ToggleRight, Users, CheckCircle, RefreshCw, Plus, MapPin } from "lucide-react";

interface DriverPanelProps {
  angkots: Angkot[];
  selectedMapCoords: { lat: number; lng: number } | null;
  onUpdatePosition: (angkotId: string, lat: number, lng: number) => Promise<any>;
  onUpdateStatusToBackend: (angkotId: string, status: "aktif" | "tidak_aktif", penumpangAktif: number) => Promise<any>;
  onRegisterAngkot: (driverName: string, plateNumber: string, routeCode: string, lat: number, lng: number, routeName: string, driverPhone: string) => Promise<any>;
  refreshAllData: () => void;
}

export default function DriverPanel({
  angkots,
  selectedMapCoords,
  onUpdatePosition,
  onUpdateStatusToBackend,
  onRegisterAngkot,
  refreshAllData,
}: DriverPanelProps) {
  const [selectedAngkotId, setSelectedAngkotId] = useState<string>("");
  const [isRegisterMode, setIsRegisterMode] = useState<boolean>(false);
  
  // Registration Form State
  const [newDriverName, setNewDriverName] = useState("");
  const [newPlateNumber, setNewPlateNumber] = useState("");
  const [newRouteCode, setNewRouteCode] = useState("");
  const [newRouteName, setNewRouteName] = useState("");
  const [newDriverPhone, setNewDriverPhone] = useState("");
  
  // Active selected Driver details local state
  const [localPaxCount, setLocalPaxCount] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [updating, setUpdating] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>("");

  const currentDriver = angkots.find(a => a.id === selectedAngkotId);

  // Sync state when driver changes
  useEffect(() => {
    if (currentDriver) {
      setLocalPaxCount(currentDriver.penumpangAktif);
      setIsActive(currentDriver.status === "aktif");
    }
  }, [selectedAngkotId, currentDriver]);

  const handleUpdateStatus = async (newStatus: "aktif" | "tidak_aktif", newPax: number) => {
    if (!selectedAngkotId) return;
    setUpdating(true);
    try {
      await onUpdateStatusToBackend(selectedAngkotId, newStatus, newPax);
      setSuccessMsg("Status & jumlah penumpang berhasil diperbarui!");
      setTimeout(() => setSuccessMsg(""), 3000);
      refreshAllData();
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(false);
    }
  };

  const handleTapCoordinate = async () => {
    if (!selectedAngkotId) return;
    if (!selectedMapCoords) {
      alert("Silakan klik / tap terlebih dahulu di area jalan pada PETA di atas untuk menentukan titik koordinat posisi Anda!");
      return;
    }
    setUpdating(true);
    try {
      await onUpdatePosition(selectedAngkotId, selectedMapCoords.lat, selectedMapCoords.lng);
      setSuccessMsg("📍 Koordinat lokasi Anda berhasil dikirim & diperbarui!");
      setTimeout(() => setSuccessMsg(""), 3000);
      refreshAllData();
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDriverName || !newPlateNumber || !newRouteCode || !newDriverPhone) {
      alert("Harap lengkapi semua isian pendaftaran driver!");
      return;
    }
    
    // Neutral fallback when no map point has been selected yet.
    const initialLat = 0;
    const initialLng = 117;
    
    setUpdating(true);
    try {
      const result = await onRegisterAngkot(
        newDriverName,
        newPlateNumber.toUpperCase(),
        newRouteCode,
        selectedMapCoords ? selectedMapCoords.lat : initialLat,
        selectedMapCoords ? selectedMapCoords.lng : initialLng,
        newRouteName || `Jalur ${newRouteCode}`,
        newDriverPhone
      );
      if (result && result.data) {
        setSelectedAngkotId(result.data.id);
        setIsRegisterMode(false);
        setNewDriverName("");
        setNewPlateNumber("");
        setNewRouteCode("");
        setNewRouteName("");
        setNewDriverPhone("");
        setSuccessMsg(`Pendaftaran driver "${newDriverName}" sukses! Angkot aktif.`);
        setTimeout(() => setSuccessMsg(""), 3000);
        refreshAllData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div id="driver-portal" className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-900">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span className="p-1.5 bg-emerald-100 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">🚍</span>
          <span>Portal Supir Angkot</span>
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setIsRegisterMode(!isRegisterMode);
              setSelectedAngkotId("");
            }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-all duration-200"
          >
            {isRegisterMode ? "Batal Daftar" : "Daftar Supir Baru"}
            <Plus size={14} />
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-emerald-700 dark:text-emerald-400 text-xs font-medium flex items-center gap-2 animate-fade-in">
          <CheckCircle size={15} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Driver Registration Mode */}
      {isRegisterMode ? (
        <form onSubmit={handleRegister} className="space-y-4">
          <p className="text-xs text-slate-500 mb-2">
            Isi formulir berikut untuk memasukkan angkot Anda ke dalam daftar pelacakan rute.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Nama Supir / Panggilan
            </label>
            <input
              type="text"
              placeholder="Contoh: Mang Dadang"
              value={newDriverName}
              onChange={(e) => setNewDriverName(e.target.value)}
              required
              className="w-full text-sm px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Plat Nomor Angkot
              </label>
              <input
                type="text"
                placeholder="Contoh: D 1234 XX"
                value={newPlateNumber}
                onChange={(e) => setNewPlateNumber(e.target.value)}
                required
                className="w-full text-sm px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                No. HP / WhatsApp Supir
              </label>
              <input
                type="text"
                placeholder="Contoh: 081234567890"
                value={newDriverPhone}
                onChange={(e) => setNewDriverPhone(e.target.value)}
                required
                className="w-full text-sm px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Kode Rute / No. Trayek (Bebas Kota Mana Saja)
              </label>
              <input
                type="text"
                placeholder="Contoh: 05, Line A, JKT-02"
                value={newRouteCode}
                onChange={(e) => setNewRouteCode(e.target.value)}
                required
                className="w-full text-sm px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Nama Deskripsi Rute Jalan
              </label>
              <input
                type="text"
                placeholder="Contoh: Terminal Utara - Pusat Kota"
                value={newRouteName}
                onChange={(e) => setNewRouteName(e.target.value)}
                required
                className="w-full text-sm px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {selectedMapCoords && (
            <div className="bg-blue-50 dark:bg-blue-950/20 p-2.5 rounded-xl border border-blue-100 dark:border-blue-900/40 text-[11px] text-blue-700 dark:text-blue-400">
              <span className="font-semibold">📍 Lokasi Awal Terdeteksi:</span> Dari ketukan Anda di peta (Latitude: {selectedMapCoords.lat.toFixed(4)}, Longitude: {selectedMapCoords.lng.toFixed(4)})
            </div>
          )}

          <button
            type="submit"
            disabled={updating}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            {updating ? "Mendaftarkan..." : "Daftarkan Angkot & Mulai Mengemudi"}
            <ChevronRight size={16} />
          </button>
        </form>
      ) : (
        /* Driver Main Dashboard Mode */
        <div className="space-y-5">
          {/* Choose Angkot to Driver Select */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
              Pilih Identitas Angkot Anda:
            </label>
            <select
              value={selectedAngkotId}
              onChange={(e) => setSelectedAngkotId(e.target.value)}
              className="w-full text-sm px-3.5 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            >
              <option value="" disabled>-- Pilih Angkot / Driver Anda --</option>
              {angkots.map((angkot) => (
                <option key={angkot.id} value={angkot.id}>
                  🚍 [{angkot.routeCode}] {angkot.plateNumber} (Supir: {angkot.driverName})
                </option>
              ))}
            </select>
          </div>

          {currentDriver ? (
            <div className="space-y-5 animate-fade-in">
              {/* Status Section */}
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-900 grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase">
                    Status Operasional
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const newS = !isActive ? "aktif" : "tidak_aktif";
                        setIsActive(!isActive);
                        handleUpdateStatus(newS as any, localPaxCount);
                      }}
                      className="focus:outline-none"
                    >
                      {isActive ? (
                        <ToggleRight className="text-emerald-500 w-11 h-7" />
                      ) : (
                        <ToggleLeft className="text-slate-400 w-11 h-7" />
                      )}
                    </button>
                    <span className={`text-xs font-bold ${isActive ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
                      {isActive ? "TAMPIL DI PETA" : "OFF / MATI"}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase">
                    Jumlah Penumpang Saat Ini
                  </span>
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => {
                        const newVal = Math.max(0, localPaxCount - 1);
                        setLocalPaxCount(newVal);
                        handleUpdateStatus(isActive ? "aktif" : "tidak_aktif", newVal);
                      }}
                      className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold px-2.5 py-1 rounded-lg text-sm transition-all"
                    >
                      -
                    </button>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200 w-8 text-center bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-900 py-1 rounded-md">
                      {localPaxCount} <span className="text-[10px] text-slate-400">/12</span>
                    </span>
                    <button
                      onClick={() => {
                        const newVal = Math.min(12, localPaxCount + 1);
                        setLocalPaxCount(newVal);
                        handleUpdateStatus(isActive ? "aktif" : "tidak_aktif", newVal);
                      }}
                      className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold px-2.5 py-1 rounded-lg text-sm transition-all"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Tap Coordinates Panel */}
              <div className="p-4 bg-orange-50/60 dark:bg-orange-950/10 border border-orange-100 dark:border-orange-900/30 rounded-xl space-y-3">
                <div className="flex items-start gap-2.5">
                  <span className="text-xl">📍</span>
                  <div>
                    <h3 className="text-xs font-bold text-orange-800 dark:text-orange-400 uppercase tracking-wide">
                      TAP KOORDINAT MANUAl (Supir)
                    </h3>
                    <p className="text-[11px] text-orange-700/80 dark:text-orange-400/70 mt-1 leading-relaxed">
                      Cara kerja pelacakan efisien: Cukup ketuk lokasi nyata Anda saat ini di <span className="font-semibold text-orange-900 dark:text-orange-300">PETA INTERAKTIF</span> diatas, lalu ketuk tombol di bawah untuk melaporkan titik koordinat terakhir Anda kepada para calon penumpang.
                    </p>
                  </div>
                </div>

                {selectedMapCoords ? (
                  <div className="mt-2 space-y-2.5">
                    <div className="bg-white/80 dark:bg-slate-950/80 px-3 py-1.5 rounded-lg border border-orange-200/50 dark:border-orange-850/40 text-[11px] text-slate-700 dark:text-slate-300 font-mono flex items-center justify-between">
                      <span>Latitude: <b>{selectedMapCoords.lat.toFixed(5)}</b></span>
                      <span>Longitude: <b>{selectedMapCoords.lng.toFixed(5)}</b></span>
                    </div>
                    <button
                      type="button"
                      disabled={updating || !isActive}
                      onClick={handleTapCoordinate}
                      className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
                    >
                      <Send size={14} />
                      {updating ? "Mengirim..." : "TAP SEKARANG: KIRIM KOORDINAT BARU"}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-4 bg-white/40 dark:bg-slate-900/20 border border-dashed border-orange-200 dark:border-orange-900/30 rounded-lg text-[11px] text-orange-800/80 dark:text-orange-400/80 font-medium">
                    ⚠️ Silakan ketuk / klik pada peta utama untuk memilih titik posisi Anda!
                  </div>
                )}
              </div>

              {/* Current Driver Info Hud */}
              <div className="text-[10px] text-slate-400 flex justify-between items-center bg-slate-50 dark:bg-slate-900/30 p-2.5 rounded-lg border border-slate-100 dark:border-slate-900 font-mono">
                <span>Terakhir diperbarui:</span>
                <span>{new Date(currentDriver.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed border-slate-100 dark:border-slate-900 rounded-xl text-slate-400 space-y-2">
              <span>🚐</span>
              <span className="text-xs font-medium">Silakan pilih Angkot Anda atau daftar supir baru untuk mengakses kontrol peta supir.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
