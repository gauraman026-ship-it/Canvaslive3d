export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const dbURL = "https://canvax-live-result-default-rtdb.firebaseio.com/";

    // Get current date and time in IST
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const todayStr = now.toISOString().split('T')[0];

    let currentHour = now.getHours();
    let currentMinute = now.getMinutes();

    // Market closed check (After 10:00 PM)
    if (currentHour > 22 || (currentHour === 22 && currentMinute > 0)) {
      return res.status(200).json({ success: false, message: "Market Closed for today." });
    }

    // Generate time slots from 9:00 AM to 10:00 PM (every 15 mins) - Colon format MATCHED with frontend
    let slots = [];
    for (let h = 9; h <= 22; h++) {
      for (let m = 0; m < 60; m += 15) {
        if (h === 22 && m > 0) break;
        let hh = h > 12 ? h - 12 : h;
        let ampm = h >= 12 ? 'PM' : 'AM';
        let t = hh + ':' + (m === 0 ? '00' : m) + ' ' + ampm;
        slots.push(t);
      }
    }

    // 5 minute aage ka time consider karein kyunki cron 5 minute pehle run hota hai
    let checkTime = new Date(now.getTime() + 5 * 60000);

    // Find current or upcoming slot to trigger
    let activeSlot = slots[0];
    for (let i = 0; i < slots.length; i++) {
      let [t, ampm] = slots[i].split(' ');
      let [h, m] = t.split(':').map(Number);
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;

      let slotTime = new Date(now);
      slotTime.setHours(h, m, 0, 0);

      if (checkTime > slotTime) {
        activeSlot = slots[i];
      } else {
        break;
      }
    }

    // 1. Pehle check karein ki kya is slot par pehle se koi manual ya fixed result dala gaya hai?
    const checkRes = await fetch(`${dbURL}/results/${todayStr}/${activeSlot}.json`);
    const existingData = await checkRes.json();

    if (existingData && existingData.manualOverride) {
      return res.status(200).json({
        success: true,
        message: "Manual override active for this slot. Skipping auto-generation.",
        slot: activeSlot
      });
    }

    // 2. Firebase se blocked numbers fetch karein
    const blockedRes = await fetch(`${dbURL}/blocked_numbers.json`);
    const blockedData = await blockedRes.json();
    const blockedList = blockedData ? Object.keys(blockedData) : [];

    // Helper function to generate balanced number avoiding blocked list
    function generateValidNumber() {
      let numStr;
      let attempts = 0;
      do {
        let randNum = Math.floor(Math.random() * 1000);
        numStr = String(randNum).padStart(3, '0');
        attempts++;
      } while (blockedList.includes(numStr) && attempts < 50);
      return numStr;
    }

    // Agar pehle se result nahi hai, tabhi naya generate karein (Slot Locking check)
    let finalResultData = existingData;
    if (!existingData || !existingData.A) {
      finalResultData = {
        A: generateValidNumber(),
        B: generateValidNumber(),
        C: generateValidNumber(),
        timestamp: new Date().toISOString()
      };

      // Firebase mein save karein
      await fetch(`${dbURL}/results/${todayStr}/${activeSlot}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalResultData)
      });
    }

    return res.status(200).json({
      success: true,
      message: "Result generated and synced successfully via Cron.",
      slot: activeSlot,
      data: finalResultData
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
