import https from 'https';

export default async function handler(req, res) {
  try {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const hours = now.getHours();
    const minutes = Math.floor(now.getMinutes() / 15) * 15;

    if (hours < 9 || hours > 22 || (hours === 22 && minutes > 0)) {
      return res.status(200).json({ message: "Market Closed." });
    }

    let hh = hours > 12 ? hours - 12 : hours;
    if (hh === 0) hh = 12;
    const ampm = hours >= 12 ? "PM" : "AM";
    const minStr = minutes < 10 ? "0" + minutes : minutes;
    const slotTime = `${hh}:${minStr} ${ampm}`;
    const todayStr = now.toISOString().split("T")[0];

    const slotUrl = `https://canvas-live-result-default-rtdb.firebaseio.com/results/${todayStr}/${encodeURIComponent(slotTime)}.json`;
    const blockUrl = `https://canvas-live-result-default-rtdb.firebaseio.com/blocked_numbers.json`;

    const fetchData = (url, method = "GET", payload = null) => {
      return new Promise((resolve, reject) => {
        const reqOpts = https.request(url, { method }, (resStream) => {
          let body = "";
          resStream.on("data", (chunk) => body += chunk);
          resStream.on("end", () => {
            try { resolve(JSON.parse(body)); } catch(e) { resolve(body); };
          });
        });
        reqOpts.on("error", reject);
        if (payload) reqOpts.write(JSON.stringify(payload));
        reqOpts.end();
      });
    };

    const existing = await fetchData(slotUrl);
    if (existing && existing.A && existing.B && existing.C) {
      return res.status(200).json({ message: `Slot ${slotTime} already filled. Skipped.` });
    }

    const blockedData = await fetchData(blockUrl) || {};
    const blockedArray = Object.keys(blockedData);

    function genNum() {
      let attempts = 0;
      let numStr;
      do {
        let randProfile = Math.random();
        let randNum;
        if (randProfile < 0.3) randNum = Math.floor(Math.random() * 700) + 150;
        else if (randProfile < 0.6) randNum = Math.floor(Math.random() * 500);
        else randNum = Math.floor(Math.random() * 1000);

        numStr = String(randNum).padStart(3, "0");
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
    await fetchData(slotUrl, "PUT", payload);

    return res.status(200).json({ success: true, slot: slotTime, result: payload });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
