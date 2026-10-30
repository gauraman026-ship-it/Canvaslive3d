export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const dBSURL = "https://canvas-live-result-default-rtdb.firebaseio.com/";

    // Get current date and time in IST
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const todayStr = now.toISOString().split('T')[0];

    let currentHour = now.getHours();
    let currentMinute = now.getMinutes();

    // Market closed check (After 10:00 PM)
    if (currentHour > 22 || (currentHour === 22 && currentMinute > 0)) {
      return res.status(200).json({ success: false, message: "Market Closed for today." });
    }

    // Generate time slots from 9:00 AM to 10:00 PM (every 15 mins)
    let slots = [];
    for (let h = 9; h < 22; h++) {
      for (let m = 0; m < 60; m += 15) {
        if (h === 22 && m > 0) break;
        let hh = h > 12 ? h - 12 : h;
        let ampm = h >= 12 ? 'PM' : 'AM';
        let t = hh + ":" + (m === 0 ? '00' : m) + " " + ampm;
        slots.push(t);
      }
    }

    // Find current or upcoming slot to trigger
    let activeSlot = slots[0];
    for (let i = 0; i < slots.length; i++) {
      let [timePart, ampm] = slots[i].split(' ');
      let [h, n] = timePart.split(':').map(Number);
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;

      let slotTime = new Date(now);
      slotTime.setHours(h, n, 0, 0);

      if (now >= slotTime) {
        activeSlot = slots[i];
      } else {
        break;
      }
    }

    // Fetch existing blocked numbers and results from Firebase using REST API
    const [blockedRes, resultRes] = await Promise.all([
      fetch(`${dBSURL}/blocked_numbers.json`),
      fetch(`${dBSURL}/results/${todayStr}/${activeSlot}.json`)
    ]);

    const blockedData = await blockedRes.json();
    const existingResult = await resultRes.json();

    if (existingResult) {
      return res.status(200).json({ success: true, message: "Result already exists for a slot.", slot: activeSlot });
    }

    // Generate Draw Result
    const currentTimestamp = new Date().toISOString();
    const resultData = {
      success: true,
      message: "Canvas 3D Result generated successfully via Cron",
      timestamp: currentTimestamp,
      slot: activeSlot,
      drawId: Math.floor(100000 + Math.random() * 900000)
    };

    // Save result to Firebase using REST API (PUT request)
    await fetch(`${dBSURL}/results/${todayStr}/${activeSlot}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resultData)
    });

    // Vercel deployment sync verified update
    return res.status(200).json(resultData);
  } catch (error) {
    console.error("Cron Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
