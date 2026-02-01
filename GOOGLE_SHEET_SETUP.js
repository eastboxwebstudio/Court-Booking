/**
 * GOOGLE APPS SCRIPT - COURTMAS BACKEND (PRODUCTION)
 * 
 * !!! PENTING: ARAHAN DEPLOYMENT YANG SANGAT KRITIKAL !!!
 * 
 * 1. Copy kod ini ke dalam Google Apps Script.
 * 2. Save.
 * 3. Pilih function "authorizeScript" dari toolbar dan klik "Run".
 *    - Berikan kebenaran (Review Permissions -> Allow).
 * 
 * 4. *** LANGKAH PALING PENTING (DEPLOYMENT) ***
 *    - Klik "Deploy" > "Manage Deployments".
 *    - Klik ikon Pensil (Edit) pada deployment yang aktif.
 *    - Pastikan setting berikut ADALAH TEPAT (JANGAN SALAH):
 *      
 *      -> Execute as: "Me" (email anda)
 *         (JANGAN PILIH 'User accessing the web app' - INI PUNCA ERROR UTAMA!)
 * 
 *      -> Who has access: "Anyone"
 *         (Supaya public boleh akses tanpa login Google)
 * 
 *    - Pada bahagian Version, pilih "New version".
 *    - Klik "Deploy".
 *    - COPY URL Web App yang bermula dengan https://script.google.com/... dan masukkan dalam App.tsx
 */

// --- KONFIGURASI TOYYIBPAY ---
const TOYYIB_SECRET_KEY = '4hocj8ko-nvuz-djra-pbfa-3vmdujvh11dm';
const TOYYIB_CATEGORY_CODE = '4s8uxwdx';

// URL Website anda (Tempat user akan dihantar selepas bayar)
const RETURN_URL = 'https://badmintoncourtbooking.mohdaizatabdullah.workers.dev/';

function doGet(e) {
  // SAFETY CHECK: Jika user tekan Run secara manual di editor
  if (!e || !e.parameter) {
    console.error("⚠️ JANGAN RUN 'doGet' SECARA MANUAL.");
    console.error("Sila pilih function 'authorizeScript' untuk setup permission.");
    console.error("Atau Deploy sebagai Web App untuk menggunakan function ini.");
    return ContentService.createTextOutput("Ralat: Function ini dijalankan secara manual. Sila lihat Logs.");
  }

  const params = e.parameter;
  const action = params.action;
  
  if (action === 'getCourts') {
    return getCourts();
  } else if (action === 'getBookings') {
    return getBookings(params.date);
  } else if (action === 'getAllBookings') {
    return getAllBookings();
  }
  
  return responseJSON({error: 'Invalid action'});
}

function doPost(e) {
  // SAFETY CHECK: Jika user tekan Run secara manual di editor
  if (!e) {
    console.error("⚠️ JANGAN RUN 'doPost' SECARA MANUAL.");
    return ContentService.createTextOutput("Ralat: Function ini dijalankan secara manual. Sila lihat Logs.");
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
     return responseJSON({status: 'error', message: 'Server busy, please try again.'});
  }

  try {
    var body = e.postData ? e.postData.contents : null;
    if (!body) return responseJSON({status: 'error', message: 'No data received'});
    
    var payload;
    try {
      payload = JSON.parse(body);
    } catch (parseError) {
      return responseJSON({status: 'error', message: 'Invalid JSON format'});
    }
    
    const action = payload.action;
    
    // 1. Initiate Payment (Dapatkan Link ToyyibPay)
    if (action === 'initiatePayment') {
       return createToyyibBill(payload);
    }
    
    // 2. Save Booking (Selepas Bayaran Berjaya)
    if (action === 'createBooking') {
      return createBooking(payload);
    }
    
    // 3. Update Court (Admin)
    if (action === 'updateCourt') {
      return updateCourt(payload);
    }
    
    return responseJSON({status: 'error', message: 'Invalid action in payload'});
    
  } catch (err) {
    return responseJSON({status: 'error', message: err.toString()});
  } finally {
    lock.releaseLock();
  }
}

// --- FUNGSI KHAS: AUTHORIZATION ---
function authorizeScript() {
  // Jalankan function ini SEKALI dalam editor.
  // KITA BUANG TRY-CATCH SUPAYA GOOGLE TERPAKSA MINTA PERMISSION (POPUP AKAN KELUAR).
  
  console.log("⏳ Memulakan proses authorisasi...");
  console.log("⚠️ Sila periksa skrin anda untuk popup 'Authorization Required'.");
  
  // Panggilan dummy ini akan memaksa Google meminta izin UrlFetchApp
  const response = UrlFetchApp.fetch("https://www.google.com");
  
  console.log("✅ BERJAYA! Status code: " + response.getResponseCode());
  console.log("✅ Skrip kini mempunyai kebenaran akses internet.");
  console.log("📢 PENTING: Sila pergi ke 'Deploy' > 'Manage Deployments' > 'Edit' > 'New version' > 'Deploy' sekarang!");
}

// --- TOYYIBPAY LOGIC ---

function createToyyibBill(payload) {
  // Payload expects: userName, userEmail, userPhone, totalPrice (in RM), courtName, dateStr
  
  var url = 'https://toyyibpay.com/index.php/api/createBill';
  
  // Convert price to cents (RM1 = 100 cents)
  var amountCents = Math.round(payload.totalPrice * 100);
  
  var data = {
    'userSecretKey': TOYYIB_SECRET_KEY,
    'categoryCode': TOYYIB_CATEGORY_CODE,
    'billName': 'Tempahan CourtMas',
    'billDescription': 'Tempahan Gelanggang: ' + payload.courtName + ' (' + payload.dateStr + ')',
    'billPriceSetting': 1,
    'billPayorInfo': 1,
    'billAmount': amountCents,
    'billReturnUrl': RETURN_URL,
    'billCallbackUrl': RETURN_URL, // Optional: You might want a separate webhook endpoint later
    'billTo': payload.userName,
    'billEmail': payload.userEmail,
    'billPhone': payload.userPhone,
    'billSplitPayment': 0,
    'billPaymentChannel': 'FPX',
    'billContentEmail': 'Terima kasih atas tempahan anda!',
    'billChargeToCustomer': 1
  };
  
  var options = {
    'method': 'post',
    'payload': data
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    var responseText = response.getContentText();
    var result = JSON.parse(responseText);
    
    // ToyyibPay returns an array with the bill code on success
    if (Array.isArray(result) && result[0].BillCode) {
       return responseJSON({
         status: 'success', 
         paymentUrl: 'https://toyyibpay.com/' + result[0].BillCode,
         billCode: result[0].BillCode
       });
    } else {
       return responseJSON({status: 'error', message: 'ToyyibPay Error: ' + responseText});
    }
    
  } catch (e) {
    // Tangkap error permission jika user lupa authorize ATAU lupa deploy new version
    if (e.toString().includes("permission")) {
       return responseJSON({status: 'error', message: 'PERMISSION ERROR: Sila run authorizeScript() DAN Deploy New Version.'});
    }
    return responseJSON({status: 'error', message: 'Fetch Error: ' + e.toString()});
  }
}

// --- SHEET LOGIC ---

function getCourts() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Courts');
  const data = sheet.getDataRange().getValues();
  const rows = data.slice(1);
  
  const results = rows.map(row => ({
    id: row[0],
    name: row[1],
    type: row[2],
    sport: row[3],
    pricePerHour: row[4],
    isAvailable: row[5]
  }));
  
  return responseJSON(results);
}

function updateCourt(payload) {
  // payload: { id, pricePerHour, isAvailable }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Courts');
  const data = sheet.getDataRange().getValues();
  
  // Find row by ID (Column A is Index 0)
  // Data starts at row 2 (index 1 in array if we include headers, or we slice).
  // Let's iterate raw data
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == payload.id) {
       // Update Price (Column E -> Index 4)
       if (payload.pricePerHour !== undefined) {
         sheet.getRange(i + 1, 5).setValue(payload.pricePerHour);
       }
       // Update Availability (Column F -> Index 5)
       if (payload.isAvailable !== undefined) {
         sheet.getRange(i + 1, 6).setValue(payload.isAvailable);
       }
       return responseJSON({status: 'success', message: 'Court updated'});
    }
  }
  return responseJSON({status: 'error', message: 'Court ID not found'});
}

function getBookings(date) {
  // For User: Get specific date bookings only (to show busy slots)
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bookings');
  const data = sheet.getDataRange().getValues();
  const bookedSlots = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] == date) {
      bookedSlots.push({ timeSlotId: data[i][3] });
    }
  }
  
  return responseJSON(bookedSlots);
}

function getAllBookings() {
  // For Admin: Get recent bookings (limit 50 for performance)
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bookings');
  const data = sheet.getDataRange().getValues();
  const bookings = [];
  
  // Iterate backwards to get latest
  const limit = 50;
  let count = 0;
  
  for (let i = data.length - 1; i >= 1; i--) {
    if (count >= limit) break;
    
    // Structure based on schema: 
    // ID, CourtID, Date, SlotID, Hour, Name, Email, Phone, Price, CreatedAt, BillCode
    bookings.push({
      id: data[i][0],
      courtId: data[i][1],
      date: data[i][2],
      timeSlotId: data[i][3],
      userName: data[i][5],
      userPhone: data[i][7],
      totalPrice: data[i][8],
      billCode: data[i][10] || '-'
    });
    count++;
  }
  
  return responseJSON(bookings);
}

function createBooking(payload) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bookings');
  var lastRow = sheet.getLastRow();
  var rows = [];
  var timestampStr = Utilities.formatDate(new Date(), "Asia/Kuala_Lumpur", "yyyy-MM-dd HH:mm:ss");
  
  payload.selectedSlots.forEach(function(slotId) {
    var parts = slotId.split('-');
    var hour = parseInt(parts[parts.length - 1]);
    
    rows.push([
      (lastRow + rows.length + 1),
      payload.courtId,
      payload.date,
      slotId,
      hour,
      payload.userName,
      payload.userEmail,
      payload.userPhone,
      payload.totalPrice,
      timestampStr,
      payload.billCode || 'MANUAL/OFFLINE' // Save BillCode for reference
    ]);
  });
  
  if (rows.length > 0) {
    sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
  
  return responseJSON({status: 'success', count: rows.length});
}

function responseJSON(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}