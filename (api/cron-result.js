import https from 'https';
import admin from 'firebase-admin';

// Initialize Firebase Admin safely handling newlines in private key
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined
    }),
    databaseURL: "https://canvas-live-result-default-rtdb.firebaseio.com"
  });
}

export default async function handler(req, res) {
  try {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const hours = now.getHours();
    const minutes = now.getMinutes();

    if (hours < 9 || hours > 22 || (hours === 22 && minutes > 0)) {
      return res.status(200).json({ message: "Market Closed." });
    }

    let bh = hours > 12 ? hours - 12 : hours;
    if (bh === 0) bh = 12;
    const slotHrs = bh < 10 ? "0" + bh : "" + bh;
    const slotMin = minutes < 10 ? "0" + minutes : minutes;
    const slotTime = `${slotHrs}:${slotMin}`;
    const todayStr = now.toISOString().split('T')[0];

    const db = admin.database();
    const slotRef = db.ref(`results/${todayStr}/${slotTime}`);
    const blockRef = db.ref(`blocked_numbers`);

    const slotSnap = await slotRef.get();
    if (slotSnap.exists()) {
      return res.status(200).json({ message: `Slot ${slotTime} already filled. Skipped.` });
    }

    const blockSnap = await blockRef.get();
    const blockedArray = Object.keys(blockSnap.val() || {});

    function genNum() {
      let attempts = 0;
      let numStr;
      do {
        let randProfile = Math.random();
        let randNum;
        if (randProfile < 0.4) randNum = Math.floor(Math.random() * 100);
        else if (randProfile < 0.8) randNum = Math.floor(Math.random() * 900) + 100;
        else randNum = Math.floor(Math.random() * 1000);
        
        numStr = String(randNum).padStart(3, '0');
        attempts++;

        let isBlocked = blockedArray.some(b => {
          if (numStr === b) return true;
          if (b.length === 2 && (numStr.includes(b) || numStr.endsWith(b) || numStr.startsWith(b))) return true;
          return false;
        });

        if (!isBlocked || attempts > 50) break;
      } while (true);
      return numStr;
    }

    const payload = { A: genNum(), B: genNum(), C: genNum() };
    await slotRef.set(payload);

    return res.status(200).json({ success: true, slotTime, result: payload });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
