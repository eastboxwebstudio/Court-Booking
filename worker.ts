// Define D1 types locally to satisfy the compiler
interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: any;
  error?: string;
}

interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  dump(): Promise<ArrayBuffer>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1Result<unknown>>;
}

export interface Env {
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const method = request.method;

    // CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // API Routes
    if (url.pathname.startsWith("/api")) {
      try {
        // GET /api/courts
        if (url.pathname === "/api/courts" && method === "GET") {
          const { results } = await env.DB.prepare("SELECT * FROM courts").all();
          return new Response(JSON.stringify(results), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // GET /api/bookings?date=YYYY-MM-DD
        if (url.pathname === "/api/bookings" && method === "GET") {
          const date = url.searchParams.get("date");
          if (!date) return new Response("Date required", { status: 400, headers: corsHeaders });

          const { results } = await env.DB.prepare(
            "SELECT timeSlotId FROM bookings WHERE date = ?"
          )
            .bind(date)
            .all();

          return new Response(JSON.stringify(results), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // POST /api/bookings
        if (url.pathname === "/api/bookings" && method === "POST") {
          const body = await request.json() as any;
          const { courtId, date, selectedSlots, userName, userEmail, userPhone, totalPrice } = body;

          // Simple validation
          if (!courtId || !date || !selectedSlots || selectedSlots.length === 0) {
             return new Response("Missing details", { status: 400, headers: corsHeaders });
          }

          // Insert each slot as a booking record (simplified for this demo)
          const stmt = env.DB.prepare(`
            INSERT INTO bookings (courtId, date, timeSlotId, hour, userName, userEmail, userPhone, totalPrice)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);

          const batch = selectedSlots.map((slotId: string) => {
             const hour = parseInt(slotId.split('-').pop() || "0");
             return stmt.bind(courtId, date, slotId, hour, userName, userEmail, userPhone, totalPrice);
          });

          await env.DB.batch(batch);

          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response("Not Found", { status: 404, headers: corsHeaders });

      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // Serve Static Assets (Frontend)
    // In a real Worker + Assets setup, this is handled automatically if we don't return a response above,
    // or we fetch from ASSETS binding. For this code, we assume API is the priority here.
    return new Response("Not Found", { status: 404 });
  },
};