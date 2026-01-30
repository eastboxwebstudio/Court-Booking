DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS courts;

CREATE TABLE courts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  sport TEXT NOT NULL,
  pricePerHour INTEGER NOT NULL,
  isAvailable BOOLEAN DEFAULT 1
);

CREATE TABLE bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  courtId INTEGER NOT NULL,
  date TEXT NOT NULL, -- Format YYYY-MM-DD
  timeSlotId TEXT NOT NULL, -- Format YYYY-MM-DD-HOUR
  hour INTEGER NOT NULL,
  userName TEXT NOT NULL,
  userEmail TEXT NOT NULL,
  userPhone TEXT NOT NULL,
  totalPrice REAL NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (courtId) REFERENCES courts(id)
);

-- Seed Data (Matches previous Mock Data)
INSERT INTO courts (id, name, type, sport, pricePerHour) VALUES 
(1, "Court Dato' Lee", 'Rubber', 'Badminton', 20),
(2, "Court Misbun", 'Rubber', 'Badminton', 20),
(3, "Court Sidek", 'Parquet', 'Badminton', 15),
(4, "Arena Harimau", 'FIFA Turf', 'Futsal', 80),
(5, "Arena Bunga Raya", 'Vinyl', 'Futsal', 70),
(6, "Pickle Pro A", 'Hard Court', 'Pickleball', 25),
(7, "Pickle Pro B", 'Hard Court', 'Pickleball', 25);
