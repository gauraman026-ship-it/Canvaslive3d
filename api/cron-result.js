export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const dbURL = "https://canvas-live-result-default-rtdb.firebaseio.com/";

    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const todayStr = now.toISOString().split('T')[0];

    let currentHour = now.getHours();
    let currentMinute = now.getMinutes();

    if (currentHour > 22 || (currentHour === 22 && currentMinute > 0)) {
      return res.status(200).json({ success: false, message: "Market Closed for today." });
    }

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

    // Exact current time use karein bina kisi 5-minute buffer ke
    let activeSlot = slots[0];
    for (let i = 0; i < slots.length; i++) {
      let [t, ampm] = slots[i].split(' ');
      let [h, m] = t.split(':').map(Number);
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;

      let slotTime = new Date(now);
      slotTime.setHours(h, m, 0, 0);

      // Jab time slot ke barabar ya usse zyada ho tabhi trigger ho
      if (now >= slotTime) {
        activeSlot = slots[i];
      } else {
        break;
      }
    }

    const checkRes = await fetch(`${dbURL}/results/${todayStr}/${activeSlot}.json`);
    const existingData = await checkRes.json();

    if (existingData && existingData.manualOverride) {
      return res.status(200).json({
        success: true,
        message: "Manual override active for this slot. Skipping auto-generation.",
        slot: activeSlot
      });
    }

    const blockedRes = await fetch(`${dbURL}/blocked_numbers.json`);
    const blockedData = await blockedRes.json();
    const blockedList = blockedData ? Object.keys(blockedData) : [];

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

    let finalResultData = existingData;
    if (!existingData || !existingData.A) {
      finalResultData = {
        A: generateValidNumber(),
        B: generateValidNumber(),
        C: generateValidNumber(),
        timestamp: new Date().toISOString()
      };

      await fetch(`${dbURL}/results/${todayStr}/${activeSlot}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalResultData)
      });
    }

    return res.status(200).json({
      success: true,
      message: "Result generated and synced successfully at exact time.",
      slot: activeSlot,
      data: finalResultData
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
