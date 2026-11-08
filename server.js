const express = require('express');
const { MAX_NUMBERS_PER_SEARCH, splitTrackingNumbers, isValidTrackingNumber, fetchCnsTracking } = require('./cns');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mock Database in memory for addresses and payment slips
const db = {
  orders: [],
  lots: [
    { id: "รถ(EK)/9194", departChina: "-", estArriveThai: "-", status: "ถึงโกดังจีน", pieces: 1, type: "รถ (EK)" },
    { id: "รถ(EK)/9148", departChina: "2026-06-13", estArriveThai: "2026-06-18", status: "ถึงโกดังไทย", pieces: 1, type: "รถ (EK)" },
    { id: "รถ(EK)/9147", departChina: "2026-06-13", estArriveThai: "2026-06-18", status: "ถึงโกดังไทย", pieces: 5, type: "รถ (EK)" },
    { id: "เรือ(SEA)/2856", departChina: "2026-06-09", estArriveThai: "2026-06-24", status: "ถึงด่านไทย รอตรวจปล่อย", pieces: 1, type: "เรือ (SEA)" },
    { id: "รถ(EK)/9135", departChina: "2026-06-09", estArriveThai: "2026-06-16", status: "ถึงโกดังไทย", pieces: 1, type: "รถ (EK)" },
    { id: "รถ(EK)/9127", departChina: "2026-06-08", estArriveThai: "2026-06-14", status: "ถึงโกดังไทย", pieces: 1, type: "รถ (EK)" },
    { id: "รถ(EK)/9124", departChina: "2026-06-06", estArriveThai: "2026-06-12", status: "ถึงโกดังไทย", pieces: 1, type: "รถ (EK)" }
  ]
};

// 1. API ค้นพัสดุ (ดึงจากหน้าผลค้นหาของ CNS Cargo) รับหลายเลขคั่นด้วย , หรือเว้นวรรค
const MOCK_TIMELINE = [
  { date: "25/06/2026 10:30", description: "ถึงโกดังไทย", done: true },
  { date: "23/06/2026 14:15", description: "ผ่านพิธีศุลกากรไทยเรียบร้อย", done: true },
  { date: "20/06/2026 09:00", description: "ถึงชายแดนไทย", done: true },
  { date: "18/06/2026 16:45", description: "ออกจากโกดังจีน", done: true },
  { date: "16/06/2026 11:20", description: "ถึงโกดังจีน", done: true }
];

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;
const requestLog = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (requestLog.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  requestLog.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

async function lookupNumber(trackingNumber) {
  if (!isValidTrackingNumber(trackingNumber)) {
    return { trackingNumber, found: false, message: 'รูปแบบเลขพัสดุไม่ถูกต้อง' };
  }
  if (trackingNumber.toUpperCase().startsWith('MOCK')) {
    return { trackingNumber, found: true, note: '', timeline: MOCK_TIMELINE };
  }
  try {
    const result = await fetchCnsTracking(trackingNumber);
    if (result === null) {
      return { trackingNumber, found: false, message: 'ไม่พบรหัสพัสดุนี้ในระบบจัดส่งสินค้า' };
    }
    if (result.steps.length === 0) {
      return { trackingNumber, found: false, message: 'พบพัสดุ แต่ยังไม่มีข้อมูลสถานะการขนส่ง' };
    }
    return { trackingNumber, found: true, note: result.note, timeline: result.steps };
  } catch (error) {
    console.error(`CNS lookup failed for ${trackingNumber}:`, error.message);
    return { trackingNumber, found: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลจากเว็บขนส่งพันธมิตร' };
  }
}

app.get('/api/track/:trackingNumbers', async (req, res) => {
  if (isRateLimited(req.ip)) {
    return res.status(429).json({ success: false, message: 'ค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' });
  }

  const numbers = splitTrackingNumbers(req.params.trackingNumbers);
  if (numbers.length === 0) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกเลขพัสดุ' });
  }
  if (numbers.length > MAX_NUMBERS_PER_SEARCH) {
    return res.status(400).json({ success: false, message: `ค้นหาได้ครั้งละไม่เกิน ${MAX_NUMBERS_PER_SEARCH} เลข` });
  }

  // ทีละเลข เพื่อไม่ยิงคำขอไปที่ CNS พร้อมกันหลายตัว
  const results = [];
  for (const number of numbers) {
    results.push(await lookupNumber(number));
  }
  res.json({ success: true, results });
});

// 2. API ดึงรายการล็อตสินค้าทั้งหมด (สำหรับหน้าจัดการล็อตสินค้าของแอดมิน/ลูกค้า)
app.get('/api/lots', (req, res) => {
  res.json({
    success: true,
    lots: db.lots
  });
});

// 3. API บันทึกคำสั่งซื้อใหม่และกรอกที่อยู่
app.post('/api/orders', (req, res) => {
  const { sender, receiver, weight, cbm, transportType } = req.body;
  
  if (!sender || !receiver) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลผู้ส่งและผู้รับ' });
  }

  // สร้างออเดอร์ใหม่จำลอง
  const newOrder = {
    orderId: "LOG-" + Math.floor(100000 + Math.random() * 900000),
    sender,
    receiver,
    weight: parseFloat(weight) || 0,
    cbm: parseFloat(cbm) || 0,
    transportType: transportType || "รถ (EK)",
    status: "รอดำเนินการ",
    createdDate: new Date().toISOString().split('T')[0]
  };

  db.orders.push(newOrder);
  res.json({ success: true, order: newOrder });
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
