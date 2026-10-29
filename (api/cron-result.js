const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY 
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : undefined,
    }),
    databaseURL: "https://canvas3d-default-rtdb.firebaseio.com" // Yahan apna sahi Firebase database URL check kar lijiye ga
  });
}

const db = admin.database();

module.exports = async (req, res) => {
  try {
    // Yahan aap apna 3D result generate karne ka aur Firebase mein save karne ka logic likhte hain
    const timestamp = Date.now();
    const resultData = {
      number: Math.floor(100 + Math.random() * 900), // Example 3D random number generator
      time: new Date().toISOString()
    };

    // Firebase mein data push karein
    await db.ref('canvas3d_results').push(resultData);

    return res.status(200).json({
      success: true,
      message: "3D Result generated and saved successfully!",
      data: resultData
    });
  } catch (error) {
    console.error("Error generating 3D result:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
