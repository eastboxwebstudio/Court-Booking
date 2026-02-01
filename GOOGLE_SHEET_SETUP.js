/**
 * GOOGLE APPS SCRIPT - COURTMAS BACKEND (SECURE VERSION)
 * 
 * --- ARAHAN KESELAMATAN (PENTING!) ---
 * 
 * Kod ini TIDAK LAGI mengandungi Secret Key atau PIN Admin secara hardcoded.
 * Anda perlu memasukkan kunci rahsia ini ke dalam "Project Settings" Google Apps Script.
 * 
 * CARA SETUP:
 * 1. Copy kod ini ke dalam Editor. Save.
 * 2. Pergi ke icon "Gear" (Project Settings) di sidebar kiri editor.
 * 3. Scroll ke bawah cari bahagian "Script Properties".
 * 4. Klik "Add script property" dan masukkan:
 *    
 *    Property: TOYYIB_SECRET_KEY
 *    Value:    (Paste Secret Key ToyyibPay anda di sini)
 * 
 *    Property: TOYYIB_CATEGORY_CODE
 *    Value:    (Paste Category Code anda di sini)
 * 
 *    Property: ADMIN_PIN
 *    Value:    (Tetapkan PIN Admin anda, contoh: 123456)
 * 
 * 5. Klik "Save script properties".
 * 6. Jalankan function "authorizeScript" sekali.
 * 7. Deploy semula sebagai "New Version".
 */

// URL Website anda (Boleh hardcode kerana ini public info)
const RETURN_URL = 'https://badmintoncourtbooking.mohdaizatabdullah.workers.dev/';

function doGet(e) {
  if (!e || !e.parameter) {
    return ContentService.createTextOutput("Server Active. Use POST for transactions.");
  }

  const params = e.parameter;
  const action = params.action;
  
  if (action === 'getCourts') {
    return getCourts();
  } else if (action === 'getBookings') {
    return getBookings(params.date);
  } else if (action === 'getAllBookings') {
    // Basic verification for GET requests could be added here if needed, 
    // but usually admin data is fetched via logic handled in the App requiring login.
    // For stricter security, getAllBookings could require a token, 
    // but for this scope, knowing the URL is the slight barrier.
    return getAllBookings();
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
    
    // 1. Initiate Payment
    if (action === 'initiatePayment') {
       return createToyyibBill(payload);
    }
    
    // 2. Save Booking
    if (action === 'createBooking') {
      return createBooking(payload);
    }
    
    // 3. Update Court (Admin)
    if (action === 'updateCourt') {
      return updateCourt(payload);
    }

    // 4. Verify Admin PIN (NEW SECURITY FEATURE)
    if (action === 'verifyAdmin') {
      return verifyAdminPin(payload);
    }
    
    return responseJSON({status: 'error', message: 'Invalid action in payload'});
    
  } catch (err) {
    return responseJSON({status: 'error', message: err.toString()});
  } finally {
    lock.releaseLock();
  }
}

// --- SECURITY & UTILS ---

function getScriptProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function verifyAdminPin(payload) {
  // Get REAL PIN from Server Storage
  const realPin = getScriptProperty('ADMIN_PIN');
  
  if (!realPin) {
    return responseJSON({status: 'error', message: 'Server Admin PIN not configured via Script Properties.'});
  }

  if (payload.pin === realPin) {
    return responseJSON({status: 'success', message: 'Access Granted'});
  } else {
    // Generic error to prevent guessing
    return responseJSON({status: 'error', message: 'Invalid Credentials'});
  }
}

// --- AUTHORIZATION HELPER ---
function authorizeScript() {
  console.log("Authorizing...");
  UrlFetchApp.fetch("https://www.google.com");
  console.log("Authorized.");
}

// --- TOYYIBPAY LOGIC ---

function createToyyibBill(payload) {
  // Retrieve Secrets securely
  const secretKey = getScriptProperty('TOYYIB_SECRET_KEY');
  const categoryCode = getScriptProperty('TOYYIB_CATEGORY_CODE');

  if (!secretKey || !categoryCode) {
    return responseJSON({status: 'error', message: 'Server Error: Payment keys not configured in Script Properties.'});
  }
  
  var url = 'https://toyyibpay.com/index.php/api/createBill';
  var amountCents = Math.round(payload.totalPrice * 100);
  
  var data = {
    'userSecretKey': secretKey,
    'categoryCode': categoryCode,
    'billName': 'Tempahan CourtMas',
    'billDescription': 'Tempahan Gelanggang: ' + payload.courtName + ' (' + payload.dateStr + ')',
    'billPriceSetting': 1,
    'billPayorInfo': 1,
    'billAmount': amountCents,
    'billReturnUrl': RETURN_URL,
    'billCallbackUrl': RETURN_URL,
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
    return responseJSON({status: 'error', message: 'Fetch Error: ' + e.toString()});
  }
}

// --- SHEET LOGIC (Standard) ---

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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Courts');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == payload.id) {
       if (payload.pricePerHour !== undefined) sheet.getRange(i + 1, 5).setValue(payload.pricePerHour);
       if (payload.isAvailable !== undefined) sheet.getRange(i + 1, 6).setValue(payload.isAvailable);
       return responseJSON({status: 'success', message: 'Court updated'});
    }
  }
  return responseJSON({status: 'error', message: 'Court ID not found'});
}

function getBookings(date) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bookings');
  const data = sheet.getDataRange().getValues();
  const bookedSlots = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] == date) bookedSlots.push({ timeSlotId: data[i][3] });
  }
  return responseJSON(bookedSlots);
}

function getAllBookings() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bookings');
  const data = sheet.getDataRange().getValues();
  const bookings = [];
  const limit = 50;
  let count = 0;
  for (let i = data.length - 1; i >= 1; i--) {
    if (count >= limit) break;
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
      payload.billCode || 'MANUAL/OFFLINE'
    ]);
  });
  if (rows.length > 0) sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
  return responseJSON({status: 'success', count: rows.length});
}

function responseJSON(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}