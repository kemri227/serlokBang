import React from "react";
import { Navigation, MapPin } from "lucide-react";
import { Angkot, Passenger, ROUTE_LIST, ROUTE_PATHS } from "../types";
import { 
  Map, 
  useMap,
  MapMarker, 
  MarkerContent, 
  MarkerTooltip, 
  MarkerLabel,
  MapControls,
  MapRoute
} from "./ui/map";
import { getCurrentCoordinates } from "../lib/utils";

interface CityMapProps {
  theme: "light" | "dark";
  angkots: Angkot[];
  passengers: Passenger[];
  selectedRole: "passenger" | "driver" | "admin";
  activeRouteFilter: string;
  onMapClick?: (lat: number, lng: number) => void;
  selectedCoordinates: { lat: number; lng: number } | null;
  selectedAngkotId: string | null;
  onSelectAngkot?: (id: string | null) => void;
  currentPassengerId?: string | null;
  onLocationResolved?: (coords: { lat: number; lng: number }) => void;
}

const CityMap: React.FC<CityMapProps> = ({
  theme,
  angkots,
  passengers,
  selectedRole,
  activeRouteFilter,
  onMapClick,
  selectedCoordinates,
  selectedAngkotId,
  onSelectAngkot,
  currentPassengerId,
  onLocationResolved
}) => {
  // Neutral fallback over Indonesia; the map immediately moves to the user's
  // gadget location (or the first registered angkot when GPS is unavailable).
  const initialPosition: [number, number] = [117.0, -2.5];

  const filteredAngkots = angkots.filter(angkot => 
    angkot.status === "aktif" && (activeRouteFilter === "all" || angkot.routeCode === activeRouteFilter)
  );

  const visiblePassengers = passengers.filter(pax => 
    pax.status === "menunggu" && (activeRouteFilter === "all" || pax.routeCode === activeRouteFilter)
  );

  // Helper component to handle map centering logic
  const MapAutoPan = () => {
    const { map } = useMap();

    React.useEffect(() => {
      if (selectedAngkotId && map) {
        const angkot = angkots.find(a => a.id === selectedAngkotId);
        if (angkot) {
          map.easeTo({
            center: [angkot.lng, angkot.lat],
            zoom: 15,
            duration: 1000
          });
        }
      }
    }, [map]);

    return null;
  };

  const InitialLocationPan = () => {
    const { map } = useMap();
    const hasCentered = React.useRef(false);

    React.useEffect(() => {
      if (!map || hasCentered.current) return;

      let cancelled = false;
      const centerMap = async () => {
        try {
          const coords = await getCurrentCoordinates();
          if (cancelled) return;
          onLocationResolved?.(coords);
          map.easeTo({ center: [coords.lng, coords.lat], zoom: 14, duration: 900 });
          hasCentered.current = true;
        } catch {
          const firstTrackedAngkot = angkots.find((angkot) => angkot.status === "aktif") || angkots[0];
          if (!cancelled && firstTrackedAngkot) {
            map.easeTo({ center: [firstTrackedAngkot.lng, firstTrackedAngkot.lat], zoom: 13, duration: 900 });
            hasCentered.current = true;
          }
        }
      };

      centerMap();
      return () => { cancelled = true; };
    }, [map, angkots, onLocationResolved]);

    return null;
  };

  return (
    <div className="w-full h-full relative group">
      <Map
        theme={theme}
        initialViewState={{
          longitude: initialPosition[0],
          latitude: initialPosition[1],
          zoom: 13,
        }}
        onClick={(e) => {
          // @ts-ignore - MapLibre GL event coordinates
          const { lng, lat } = e.lngLat;
          onMapClick?.(lat, lng);
        }}
        className="w-full h-full"
      >
        <MapControls 
          position="bottom-right" 
          showZoom={true} 
          showLocate={true}
          showFullscreen={true}
        />
        
        <MapAutoPan />
        <InitialLocationPan />

        {/* ROUTE LINE (Active Filter) */}
        {activeRouteFilter !== "all" && ROUTE_PATHS[activeRouteFilter] && (
          <MapRoute
            id={`route-${activeRouteFilter}`}
            coordinates={ROUTE_PATHS[activeRouteFilter]}
            color={ROUTE_LIST.find(r => r.code === activeRouteFilter)?.color || "#7A8D6E"}
            width={4}
            opacity={0.6}
            interactive={true}
          />
        )}

        {/* Selected Point Marker */}
        {selectedCoordinates && (
          <MapMarker 
            longitude={selectedCoordinates.lng} 
            latitude={selectedCoordinates.lat}
          >
            <MarkerContent>
              <div className="relative">
                <div className="absolute -inset-4 bg-blue-500/20 rounded-full animate-ping" />
                <div className="relative p-2 bg-blue-600 rounded-full border-2 border-white shadow-xl">
                  <MapPin size={16} className="text-white fill-current" />
                </div>
              </div>
            </MarkerContent>
            <MarkerTooltip>
              <div className="p-2 text-[10px] font-bold text-slate-800 dark:text-slate-100">Titik Terpilih</div>
            </MarkerTooltip>
          </MapMarker>
        )}

        {/* PASSENGERS */}
        {(selectedRole === "driver" || selectedRole === "admin" ? visiblePassengers : []).map((pax) => {
          const isOwn = currentPassengerId === pax.id;
          return (
            <MapMarker 
              key={`pax-${pax.id}`} 
              longitude={pax.lng} 
              latitude={pax.lat}
            >
              <MarkerContent>
                <div className="relative group">
                  <div className="absolute -inset-3 bg-orange-400/30 rounded-full animate-ping" />
                  <div className="relative p-2 bg-orange-500 rounded-full border-2 border-white shadow-2xl transition-transform group-hover:scale-110">
                    <MapPin size={16} className="text-white fill-current" />
                  </div>
                </div>
              </MarkerContent>
              <MarkerTooltip>
                <div className="p-2 text-xs">
                  <div className="font-bold text-orange-600">{pax.name} {isOwn ? "(Saya)" : ""}</div>
                  <div className="text-slate-500 dark:text-slate-300 font-medium">➔ {pax.destination}</div>
                  <div className="text-[10px] text-slate-400 mt-1">Jalur: {pax.routeCode}</div>
                </div>
              </MarkerTooltip>
            </MapMarker>
          );
        })}

        {/* ANGKOTS */}
        {(selectedRole === "passenger" || selectedRole === "admin" ? filteredAngkots : []).map((angkot) => {
          const isSelected = selectedAngkotId === angkot.id;
          let themeColor = "#10b981"; // emerald
          if (angkot.routeCode === "02") themeColor = "#f59e0b";
          if (angkot.routeCode === "34") themeColor = "#0ea5e9";
          if (angkot.routeCode === "08") themeColor = "#e11d48";
          if (angkot.routeCode === "22") themeColor = "#6366f1";

          return (
            <MapMarker 
              key={`angkot-${angkot.id}`} 
              longitude={angkot.lng} 
              latitude={angkot.lat}
              onClick={() => onSelectAngkot?.(angkot.id)}
            >
              <MarkerContent>
                <div className={`p-2 rounded-2xl border-2 shadow-2xl transition-all hover:z-50 ${
                  isSelected ? "scale-150 border-blue-500 ring-4 ring-blue-500/20 z-40" : "border-white hover:scale-110"
                }`} style={{ backgroundColor: themeColor }}>
                  <Navigation size={18} className="text-white rotate-45 fill-current" />
                </div>
              </MarkerContent>
              <MarkerLabel position="bottom" className="font-black text-[9px] bg-white/95 dark:bg-slate-900/95 text-slate-800 dark:text-slate-100 px-1.5 py-0.5 rounded shadow-sm border border-slate-200 dark:border-slate-700">
                {angkot.plateNumber}
              </MarkerLabel>
              <MarkerTooltip>
                <div className="p-2.5 text-xs min-w-[150px]">
                  <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center justify-between mb-1">
                    <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[10px]">🚐 LINE {angkot.routeCode}</span>
                    <span className="text-[10px] font-mono font-bold">{angkot.plateNumber}</span>
                  </div>
                  <div className="text-slate-500 dark:text-slate-300 mb-2">Driver: <span className="font-bold">{angkot.driverName}</span></div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                    <div className="flex flex-col">
                      <span className="text-[8px] uppercase text-slate-400 font-black">Status</span>
                      <span className={`font-bold ${angkot.status === "aktif" ? "text-emerald-600" : "text-red-500"}`}>
                        {angkot.status === "aktif" ? "Beroperasi" : "Berhenti"}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[8px] uppercase text-slate-400 font-black">Load</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">{angkot.penumpangAktif}/12</span>
                    </div>
                  </div>
                </div>
              </MarkerTooltip>
            </MapMarker>
          );
        })}
      </Map>
      
      {/* Floating Zoom Indicator */}
      <div className="absolute bottom-6 left-6 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 dark:bg-slate-900/95 backdrop-blur px-3 py-1.5 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300">
        Peta Realtime • Multi-Kota
      </div>
    </div>
  );
};

export default CityMap;
