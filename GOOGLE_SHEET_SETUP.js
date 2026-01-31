/**
 * GOOGLE APPS SCRIPT - COURTMAS BACKEND (PRODUCTION)
 * 
 * !!! PENTING: FIX UNTUK ERROR "You do not have permission to call UrlFetchApp.fetch" !!!
 * 
 * ARAHAN:
 * 1. Copy kod ini ke dalam Google Apps Script.
 * 2. Save.
 * 3. Di bahagian toolbar atas, pilih function "authorizeScript" (dropdown menu sebelah butang Debug/Run).
 * 4. Klik "Run".
 * 5. Google akan minta izin ("Review Permissions").
 *    - Klik "Review Permissions".
 *    - Pilih akaun Google anda.
 *    - Klik "Advanced" (di kiri bawah dialog).
 *    - Klik "Go to ... (unsafe)".
 *    - Klik "Allow".
 * 6. SELEPAS BERJAYA RUN, ANDA WAJIB DEPLOY SEMULA:
 *    - Klik "Deploy" > "Manage Deployments" > ikon Pensil (Edit) > Version: "New Version" > "Deploy".
 */

// --- KONFIGURASI TOYYIBPAY ---
const TOYYIB_SECRET_KEY = '4hocj8ko-nvuz-djra-pbfa-3vmdujvh11dm';
const TOYYIB_CATEGORY_CODE = '4s8uxwdx';
const RETURN_URL = 'https://badmintoncourtbooking.mohdaizatabdullah.workers.dev/';

function doGet(e) {
  const params = e.parameter;
  const action = params.action;
  
  if (action === 'getCourts') {
    return getCourts();
  } else if (action === 'getBookings') {
    return getBookings(params.date);
  }
  
  return responseJSON({error: 'Invalid action'});
}

function doPost(e) {
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
    
    return responseJSON({status: 'error', message: 'Invalid action in payload'});
    
  } catch (err) {
    return responseJSON({status: 'error', message: err.toString()});
  } finally {
    lock.releaseLock();
  }
}

// --- FUNGSI KHAS: AUTHORIZATION ---
function authorizeScript() {
  // Jalankan function ini SEKALI dalam editor untuk memberi izin akses internet
  console.log("Menguji kebenaran akses internet...");
  try {
    UrlFetchApp.fetch("https://www.google.com");
    console.log("BERJAYA! Skrip kini mempunyai kebenaran UrlFetchApp.");
    console.log("PENTING: Sila klik DEPLOY > MANAGE DEPLOYMENTS > EDIT > NEW VERSION > DEPLOY untuk kemaskini live app.");
  } catch (e) {
    console.log("RALAT: " + e.toString());
  }
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

function getBookings(date) {
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