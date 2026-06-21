export interface Angkot {
  id: string;
  driverName: string;
  plateNumber: string;
  routeCode: string;
  routeName: string;
  color: string;
  lat: number;
  lng: number;
  status: "aktif" | "tidak_aktif";
  lastUpdated: string;
  kapasitas: number;
  penumpangAktif: number;
  driverPhone?: string;
}

export interface Passenger {
  id: string;
  name: string;
  phone: string;
  lat: number;
  lng: number;
  destination: string;
  routeCode: string;
  status: "menunggu" | "sudah_naik" | "batal";
  lastUpdated: string;
}

export interface RentalRequest {
  id: string;
  customerName: string;
  customerPhone: string;
  pickupLocation: string;
  destination: string;
  pickupDate: string;
  pickupTime: string;
  durationDays: number;
  passengersCount: number;
  note: string;
  status: "menunggu" | "disetujui" | "ditolak";
  routeCode: string;
  createdAt: string;
}

export interface RentalListing {
  id: string;
  driverName: string;
  driverPhone: string;
  plateNumber: string;
  routeCode: string;
  routeName: string;
  title: string;
  description: string;
  serviceArea: string;
  mediaLinks: string[];
  isAvailable: boolean;
}

export interface RouteInfo {
  code: string;
  name: string;
  color: string;
  description: string;
}

export interface Landmark {
  name: string;
  lat: number;
  lng: number;
  type: "terminal" | "hub" | "pasar" | "mall" | "kampus" | "wisata";
  description: string;
}

export const ROUTE_LIST: RouteInfo[] = [
  { code: "05", name: "Cicaheum - Ledeng", color: "#10b981", description: "Melalui Jl. PHH. Mustofa, Jl. Pasupati, Jl. Dr. Djunjunan, Jl. Setiabudi" },
  { code: "02", name: "Dago - Kalapa", color: "#f59e0b", description: "Melalui Jl. Ir. H. Djuanda, Jl. Merdeka, Jl. Tamblong, Term. Kalapa" },
  { code: "34", name: "Sadang Serang - Caringin", color: "#0ea5e9", description: "Melalui Jl. Cikutra, Jl. Kiaracondong, Jl. Soekarno-Hatta" },
  { code: "08", name: "Cicaheum - Cibaduyut", color: "#e11d48", description: "Melalui Jl. Ahmad Yani, Jl. Ibrahim Adjie, Jl. Soekarno-Hatta" },
  { code: "22", name: "Sarijadi - Kalapa", color: "#6366f1", description: "Melalui Jl. Sukajadi, Jl. Pasirkaliki, Jl. Astana Anyar" },
  { code: "lainnya", name: "Rute Lainnya", color: "#64748b", description: "Rute angkot lainnya yang belum terdaftar secara detail" }
];

export const ROUTE_PATHS: Record<string, [number, number][]> = {
  "05": [
    [107.6530, -6.9020], [107.6350, -6.8980], [107.6185, -6.9005], [107.6050, -6.8950], [107.5940, -6.8610]
  ],
  "02": [
    [107.6150, -6.8750], [107.6105, -6.9090], [107.6070, -6.9210], [107.6025, -6.9140]
  ],
  "34": [
    [107.6300, -6.8900], [107.6350, -6.9150], [107.6250, -6.9350], [107.5950, -6.9380]
  ],
  "08": [
    [107.6530, -6.9020], [107.6450, -6.9250], [107.6150, -6.9400], [107.5950, -6.9450]
  ],
  "22": [
    [107.5850, -6.8940], [107.5950, -6.9050], [107.6050, -6.9150], [107.6070, -6.9210]
  ]
};
