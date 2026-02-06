// Local type definitions for Cloudflare D1 since they are not automatically picked up
interface D1Result<T = any> {
  results: T[];
  success: boolean;
  meta: any;
  error?: string;
}

interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = any>(colName?: string): Promise<T | null>;
  run(): Promise<D1Result>;
  all<T = any>(): Promise<D1Result<T>>;
  raw<T = any>(): Promise<T[]>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  dump(): Promise<ArrayBuffer>;
  batch<T = any>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1Result>;
}

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  DB: D1Database;
  TOYYIB_SECRET_KEY: string;
  TOYYIB_CATEGORY_CODE: string;
  ADMIN_PIN: string;
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- API ROUTES ---
    if (path.startsWith('/api/')) {
      try {
        // 0. INIT DATABASE (Reset & Seed) - Guna ini jika database kosong/error
        if (path === '/api/init' && request.method === 'POST') {
            try {
                // Drop and Recreate Tables
                await env.DB.exec(`
                    DROP TABLE IF EXISTS bookings;
                    DROP TABLE IF EXISTS courts;

                    CREATE TABLE courts (
                      id INTEGER PRIMARY KEY, -- Auto Increment implied in SQLite
                      name TEXT NOT NULL,
                      type TEXT NOT NULL,
                      sport TEXT NOT NULL,
                      pricePerHour INTEGER NOT NULL,
                      isAvailable BOOLEAN DEFAULT 1
                    );

                    CREATE TABLE bookings (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      courtId INTEGER NOT NULL,
                      date TEXT NOT NULL,
                      timeSlotId TEXT NOT NULL,
                      hour INTEGER NOT NULL,
                      userName TEXT NOT NULL,
                      userEmail TEXT NOT NULL,
                      userPhone TEXT NOT NULL,
                      totalPrice REAL NOT NULL,
                      billCode TEXT,
                      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                      FOREIGN KEY (courtId) REFERENCES courts(id)
                    );

                    INSERT INTO courts (name, type, sport, pricePerHour) VALUES 
                    ("Court Dato' Lee", 'Rubber', 'Badminton', 20),
                    ("Court Misbun", 'Rubber', 'Badminton', 20),
                    ("Court Sidek", 'Parquet', 'Badminton', 15),
                    ("Arena Harimau", 'FIFA Turf', 'Futsal', 80),
                    ("Arena Bunga Raya", 'Vinyl', 'Futsal', 70),
                    ("Pickle Pro A", 'Hard Court', 'Pickleball', 25),
                    ("Pickle Pro B", 'Hard Court', 'Pickleball', 25);
                `);
                return Response.json({ status: 'success', message: 'Database berjaya di-reset dan di-isi data!' });
            } catch (e: any) {
                return Response.json({ status: 'error', message: 'Gagal Init DB: ' + e.message }, { status: 500 });
            }
        }

        // 1. GET COURTS
        if (path === '/api/courts' && request.method === 'GET') {
          const { results } = await env.DB.prepare('SELECT * FROM courts').all();
          return Response.json(results);
        }

        // 2. GET BOOKINGS (By Date)
        if (path === '/api/bookings' && request.method === 'GET') {
          const date = url.searchParams.get('date');
          if (!date) return new Response('Date required', { status: 400 });
          
          const { results } = await env.DB.prepare('SELECT timeSlotId FROM bookings WHERE date = ?').bind(date).all();
          return Response.json(results);
        }

        // 3. CREATE BOOKING (Save to DB)
        if (path === '/api/bookings' && request.method === 'POST') {
          const body: any = await request.json();
          const { courtId, date, selectedSlots, userName, userEmail, userPhone, totalPrice, billCode } = body;

          // Insert multiple slots
          const stmt = env.DB.prepare(`
            INSERT INTO bookings (courtId, date, timeSlotId, hour, userName, userEmail, userPhone, totalPrice, billCode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          const batch = selectedSlots.map((slotId: string) => {
            const hour = parseInt(slotId.split('-').pop() || '0');
            return stmt.bind(courtId, date, slotId, hour, userName, userEmail, userPhone, totalPrice, billCode || 'MANUAL');
          });

          await env.DB.batch(batch);
          return Response.json({ status: 'success', message: 'Booking saved' });
        }

        // 4. INITIATE PAYMENT (Call ToyyibPay)
        if (path === '/api/payment' && request.method === 'POST') {
          const body: any = await request.json();
          
          if (!env.TOYYIB_SECRET_KEY || !env.TOYYIB_CATEGORY_CODE) {
             return Response.json({ status: 'error', message: 'Payment Server Config Missing' }, { status: 500 });
          }

          const amountCents = Math.round(body.totalPrice * 100);
          
          // ToyyibPay expects Form Data usually
          const formData = new URLSearchParams();
          formData.append('userSecretKey', env.TOYYIB_SECRET_KEY);
          formData.append('categoryCode', env.TOYYIB_CATEGORY_CODE);
          formData.append('billName', 'Tempahan CourtMas');
          formData.append('billDescription', `Booking: ${body.courtName} (${body.dateStr})`);
          formData.append('billPriceSetting', '1');
          formData.append('billPayorInfo', '1');
          formData.append('billAmount', amountCents.toString());
          formData.append('billReturnUrl', url.origin); // Returns to current domain
          formData.append('billCallbackUrl', url.origin);
          formData.append('billTo', body.userName);
          formData.append('billEmail', body.userEmail);
          formData.append('billPhone', body.userPhone);
          formData.append('billSplitPayment', '0');
          formData.append('billPaymentChannel', 'FPX');
          formData.append('billChargeToCustomer', '1');

          const response = await fetch('https://toyyibpay.com/index.php/api/createBill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
          });

          const result: any = await response.json();
          
          if (Array.isArray(result) && result[0].BillCode) {
            return Response.json({
              status: 'success',
              paymentUrl: 'https://toyyibpay.com/' + result[0].BillCode,
              billCode: result[0].BillCode
            });
          } else {
            return Response.json({ status: 'error', message: 'ToyyibPay Error', debug: result });
          }
        }

        // 5. ADMIN: VERIFY PIN
        if (path === '/api/admin/verify' && request.method === 'POST') {
          const body: any = await request.json();
          if (body.pin === env.ADMIN_PIN) {
             return Response.json({ status: 'success' });
          }
          return Response.json({ status: 'error', message: 'Invalid PIN' }, { status: 401 });
        }

        // 6. ADMIN: GET ALL BOOKINGS
        if (path === '/api/admin/bookings' && request.method === 'GET') {
          // Simple validation (In real app, use tokens)
          const { results } = await env.DB.prepare('SELECT * FROM bookings ORDER BY id DESC LIMIT 50').all();
          return Response.json(results);
        }

        // 7. ADMIN: UPDATE COURT
        if (path === '/api/admin/court-update' && request.method === 'POST') {
           const body: any = await request.json();
           
           let query = 'UPDATE courts SET ';
           const params = [];
           const updates = [];
           
           if (body.pricePerHour !== undefined) {
             updates.push('pricePerHour = ?');
             params.push(body.pricePerHour);
           }
           if (body.isAvailable !== undefined) {
             updates.push('isAvailable = ?');
             params.push(body.isAvailable ? 1 : 0); // SQLite uses 0/1 for boolean
           }
           
           if (updates.length === 0) return Response.json({status: 'no change'});

           query += updates.join(', ') + ' WHERE id = ?';
           params.push(body.id);

           await env.DB.prepare(query).bind(...params).run();
           return Response.json({ status: 'success' });
        }

        // 8. ADMIN: ADD NEW COURT
        if (path === '/api/admin/courts' && request.method === 'POST') {
           const body: any = await request.json();
           const { name, type, sport, pricePerHour } = body;

           // Validation
           if (!name || !type || !sport || !pricePerHour) {
             return Response.json({ status: 'error', message: 'Missing fields' }, { status: 400 });
           }

           const res = await env.DB.prepare(
             'INSERT INTO courts (name, type, sport, pricePerHour, isAvailable) VALUES (?, ?, ?, ?, 1)'
           ).bind(name, type, sport, pricePerHour).run();

           if(res.success) {
             return Response.json({ status: 'success' });
           } else {
             return Response.json({ status: 'error', message: 'DB Error' }, { status: 500 });
           }
        }

        return new Response('Not Found', { status: 404 });

      } catch (err: any) {
        return Response.json({ status: 'error', message: err.message }, { status: 500 });
      }
    }

    // --- STATIC ASSETS ---
    // If not API, serve React App
    return env.ASSETS.fetch(request);
  },
};