export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const dbURL = "https://canvas-live-result-default-rtdb.firebaseio.com";
        
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
        for (let h = 9; h <= 22; h++) {
            for (let m = 0; m < 60; m += 15) {
                if (h === 22 && m > 0) break;
                let hh = h > 12 ? h - 12 : h;
                let am = h >= 12 ? 'PM' : 'AM';
                let t = hh + ":" + (m === 0 ? '00' : m) + " " + am;
                slots.push(t);
            }
        }

        // Find current or upcoming slot to trigger
        let activeSlot = slots[0];
        for (let i = 0; i < slots.length; i++) {
            let [timePart, ampm] = slots[i].split(' ');
            let [h, m] = timePart.split(':').map(Number);
            if (ampm === 'PM' && h < 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;

            let slotTime = new Date(now);
            slotTime.setHours(h, m, 0, 0);

            if (now >= slotTime) {
                activeSlot = slots[i];
            } else {
                break;
            }
        }

        // Fetch existing blocked numbers and results from Firebase
        const [blockedRes, resultRes] = await Promise.all([
            fetch(`${dbURL}/blocked_numbers.json`),
            fetch(`${dbURL}/results/${todayStr}/${activeSlot}.json`)
        ]);

        const blockedData = await blockedRes.json();
        const existingSlotResult = await resultRes.json();

        // If result for this slot already exists, do not overwrite
        if (existingSlotResult && existingSlotResult.A) {
            return res.status(200).json({ 
                success: true, 
                message: `Slot ${activeSlot} already has a result.`, 
                data: existingSlotResult 
            });
        }

        let blockedNumbers = blockedData ? Object.keys(blockedData) : [];

        // Helper function to generate a balanced 3-digit number
        function generateBalancedNumber() {
            let numStr;
            let attempts = 0;
            do {
                let randProfile = Math.random();
                let randNum;
                if (randProfile < 0.3) {
                    randNum = Math.floor(Math.random() * 700) + 150;
                } else if (randProfile < 0.6) {
                    randNum = Math.floor(Math.random() * 500);
                } else {
                    randNum = Math.floor(Math.random() * 1000);
                }

                numStr = String(randNum).padStart(3, '0');
                attempts++;

                let isBlocked = blockedNumbers.some(b => {
                    if (numStr === b) return true;
                    if (b.length === 2 && (numStr.includes(b) || numStr.endsWith(b) || numStr.startsWith(b))) return true;
                    return false;
                });

                if (!isBlocked || attempts > 40) {
                    break;
                }
            } while (true);
            return numStr;
        }

        const newResult = {
            A: generateBalancedNumber(),
            B: generateBalancedNumber(),
            C: generateBalancedNumber()
        };

        // Save new slot result to Firebase Realtime Database
        const updateRes = await fetch(`${dbURL}/results/${todayStr}/${activeSlot}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newResult)
        });

        if (!updateRes.ok) {
            throw new Error("Failed to update Firebase database.");
        }

        return res.status(200).json({
            success: true,
            message: `Successfully generated result for slot: ${activeSlot}`,
            slot: activeSlot,
            result: newResult
        });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
