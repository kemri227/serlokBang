# auth.md — Integrasi Google OAuth + Supabase Auth (serlokBang / AngkotTrack)

Dokumen ini menjelaskan langkah integrasi **Google OAuth** dengan **Supabase Auth** dan bagaimana aplikasi ini memakainya untuk login + onboarding role.

---

## 1) Konsep yang dipakai di project

Di aplikasi ini:
- Frontend (React) login lewat **Supabase Auth** menggunakan provider **Google**.
- Supabase menyimpan sesi login (access/refresh token) di browser.
- Setelah login sukses, aplikasi menjalankan **onboarding** role melalui RPC Supabase (`complete_onboarding`).
- Role yang dipilih untuk pengguna:
  - `passenger` langsung onboarding.
  - `driver` onboarding dengan verifikasi admin.

Berikut implementasi penting di kode:
- `src/lib/supabase.ts`: membuat client Supabase dengan **publishable key**.
- `src/auth/AuthContext.tsx`: fungsi `signInWithGoogle()` dan `completeOnboarding()`.
- `src/auth/AuthGate.tsx`: UI flow (login → pilih role → onboarding → masuk aplikasi).

---

## 2) Siapkan environment variables

Aplikasi ini butuh 2 set kunci: **publishable key (frontend)** dan **service role key (server)**.

### Frontend (React/Vite) — wajib awalan `VITE_`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Frontend hanya memakai **publishable key** untuk login dan membaca data profil.

### Server (Express) — tanpa awalan `VITE_`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Server memakai **service role key** untuk:
- cek role pengguna melalui middleware (`/api`)
- operasi database sensitif (mis. simpan lokasi, approval, onboarding via RPC)

> Penting: jangan pernah menaruh `SUPABASE_SERVICE_ROLE_KEY` di variable yang diawali `VITE_`, karena itu akan bocor ke browser.


---

## 3) Buat OAuth Client ID Google (Web application)

1. Buka Google Cloud Console.
2. Buat **OAuth Client ID** tipe **Web application**.
3. Isi:
   - **Authorized JavaScript origins**
     - contoh: `http://localhost:3000`
   - **Authorized redirect URIs**
     - gunakan callback Supabase, **bukan URL localhost aplikasi**:
       `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
     - URL callback yang tepat juga ditampilkan pada halaman konfigurasi provider Google di Supabase.
4. Simpan **Client ID** dan **Client Secret**.

> `http://localhost:3000` adalah origin aplikasi. Google mengembalikan login ke Supabase terlebih dahulu melalui `/auth/v1/callback`, kemudian Supabase mengarahkan pengguna kembali ke aplikasi.

---

## 4) Konfigurasi provider Google di Supabase

1. Masuk ke Supabase Dashboard.
2. Buka **Authentication → Providers → Google**.
3. Aktifkan toggle **Enable Sign in with Google**.
4. Isi:
   - **Client ID** (dari Google)
   - **Client Secret** (dari Google)
5. Pastikan callback URL yang ditampilkan Supabase sudah dimasukkan ke **Authorized redirect URIs** di Google Cloud.
6. Simpan.

---

## 5) Konfigurasi Redirect URLs di Supabase

Di Supabase Dashboard:
1. **Authentication → URL Configuration → Redirect URLs**
2. Tambahkan URL redirect yang sesuai dengan domain aplikasi kamu.
   - local dev: `http://localhost:3000`
   - production: misalnya `https://domain-kamu.com`

Kenapa ini penting:
- Frontend memanggil OAuth dengan `redirectTo: window.location.origin`.
- Supabase harus mengizinkan redirect yang sama.

---

## 6) Jalankan project secara lokal

1. `npm install`
2. Copy `.env.example` → `.env`, lalu isi:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - serta variabel backend termasuk `SUPABASE_SERVICE_ROLE_KEY` dan konfigurasi lain yang dibutuhkan.
3. Jalankan migrasi database Supabase:
   - `supabase/migrations/202606200001_initial_tracking_schema.sql`
4. `npm run dev`

---

## 7) Flow login & onboarding role (sesuai kode)

### A. Login
- UI di `AuthGate` menampilkan tombol **“Masuk dengan Google”**.
- Di `AuthContext`, ketika tombol ditekan:
  - memanggil `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })`.

### B. Setelah kembali dari Google
- Supabase mengembalikan sesi login (dideteksi via `detectSessionInUrl`).
- `AuthContext` memanggil `supabase.auth.getSession()` dan memuat data profil dari tabel `profiles`.

### C. Onboarding
- Jika `profile.onboarding_complete === false`, user akan diminta memilih:
  - `passenger` (langsung selesai onboarding)
  - `driver` (wajib input WhatsApp; akan tetap lewat proses approval admin)
- Saat user menekan **Lanjutkan**:
  - aplikasi memanggil RPC Supabase: `complete_onboarding` dengan parameter `choice` dan `phone`.

---

## 8) Menetapkan admin pertama (SQL)

**Admin adalah role di tabel `public.profiles`.** Karena `profiles` dibuat otomatis dari `auth.users` lewat trigger `handle_new_user`, maka langkahnya umumnya:

1. Login dulu dengan Google menggunakan akun admin (biar baris `profiles` tercipta).
2. Setelah akun admin muncul di Supabase, jalankan query berikut (ganti email sesuai akun admin):

```sql
update public.profiles
set role = 'admin', onboarding_complete = true
where email = 'admin@example.com';
```

Admin berikutnya dikelola melalui proses operasional di aplikasi.


---

## 9) Troubleshooting cepat

### Masalah: tombol login tidak berfungsi / redirect error
- Pastikan:
  - `VITE_SUPABASE_URL` benar
  - `VITE_SUPABASE_PUBLISHABLE_KEY` benar
  - Redirect URLs di Google Cloud Console cocok dengan redirect di Supabase
  - Redirect URLs di Supabase cocok dengan `window.location.origin` (lokal/production)

### Masalah: `Unsupported provider: provider is not enabled`
- Buka project Supabase yang URL-nya sama dengan `VITE_SUPABASE_URL`.
- Masuk ke **Authentication → Providers → Google**.
- Aktifkan **Enable Sign in with Google**, isi Client ID dan Client Secret, lalu tekan **Save**.
- Kesalahan ini terjadi sebelum proses redirect, sehingga tidak berhubungan dengan role admin atau migrasi database.

### Masalah: setelah login tidak masuk app (loader terus)
- Pastikan tabel `profiles` sudah ada dan RPC `complete_onboarding` sudah tersedia.
- Cek apakah profil user terbuat saat onboarding.

---

## 10) Ringkasan konfigurasi yang harus benar

- [ ] Google OAuth Client ID = Web application
- [ ] Supabase Provider Google sudah **diaktifkan** dan diisi Client ID/Secret
- [ ] Google Authorized redirect URI memakai `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
- [ ] Supabase Redirect URLs sesuai domain app
- [ ] Frontend pakai `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY`
- [ ] Server pakai `SUPABASE_SERVICE_ROLE_KEY` (tanpa awalan VITE)
- [ ] Migrasi + function/RPC onboarding sudah ada
