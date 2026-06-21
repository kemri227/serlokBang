# AngkotTrack

Pelacakan angkot multi-kota dengan Google OAuth, persetujuan role supir oleh admin, Supabase/PostGIS untuk data permanen, dan Upstash Redis untuk lokasi aktif berumur pendek.

## Menjalankan lokal

1. Jalankan `npm install`.
2. Salin `.env.example` menjadi `.env` dan isi kredensialnya.
3. Jalankan migrasi [`supabase/migrations/202606200001_initial_tracking_schema.sql`](supabase/migrations/202606200001_initial_tracking_schema.sql) melalui Supabase SQL Editor atau Supabase CLI.
4. Jalankan `npm run dev`.

Tanpa kredensial Supabase, layar aplikasi akan menunjukkan petunjuk konfigurasi. Backend masih memiliki fallback in-memory untuk pengembangan, tetapi mode login membutuhkan Supabase.

## Mengaktifkan Google OAuth

1. Buat OAuth Client ID bertipe **Web application** di Google Auth Platform.
2. Tambahkan origin lokal dan production, misalnya `http://localhost:3000`.
3. Di Supabase Dashboard buka **Authentication → Providers → Google**, lalu masukkan Client ID dan Client Secret.
4. Tambahkan URL aplikasi ke **Authentication → URL Configuration → Redirect URLs**.

Frontend hanya memakai publishable key. `SUPABASE_SERVICE_ROLE_KEY` dan token Upstash wajib berada di server dan tidak boleh memakai awalan `VITE_`.

## Menetapkan admin pertama

Setelah akun admin pertama login sekali, jalankan dari SQL Editor:

```sql
update public.profiles
set role = 'admin', onboarding_complete = true
where email = 'admin@example.com';
```

Admin berikutnya harus ditetapkan melalui proses operasional yang terkontrol. Perubahan persetujuan supir lewat aplikasi dicatat di `role_audit_log`.

## Alur role

- Penumpang: onboarding selesai dan langsung masuk.
- Calon supir: wajib mengisi WhatsApp, tetap berperan sebagai penumpang dengan status `pending`.
- Admin: membuka panel **Persetujuan Supir** dan menyetujui/menolak permintaan.
- Supir disetujui: role berubah menjadi `driver`, kemudian mendaftarkan armada dan trayek sebelum share lokasi.

## Penyimpanan

- Supabase: profil, role, kota, trayek, armada, lokasi terakhir, permintaan jemput, rental, dan audit role.
- Redis: indeks GEO lokasi aktif, state marker TTL satu jam, dan channel update.
- Marker menggunakan satu record per armada. Share berikutnya melakukan update/upsert, bukan menambah marker baru.

## Pemeriksaan

```bash
npm run lint
npm run build
```
# serlokBang
