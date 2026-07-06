const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

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
    { id: "เรือ(SEA)/2856", departChina: "2026-06-09", estArriveThai: "2026-06-24", status: "ถึงด่านไทย รอดรวจปล่อย", pieces: 1, type: "เรือ (SEA)" },
    { id: "รถ(EK)/9135", departChina: "2026-06-09", estArriveThai: "2026-06-16", status: "ถึงโกดังไทย", pieces: 1, type: "รถ (EK)" },
    { id: "รถ(EK)/9127", departChina: "2026-06-08", estArriveThai: "2026-06-14", status: "ถึงโกดังไทย", pieces: 1, type: "รถ (EK)" },
    { id: "รถ(EK)/9124", departChina: "2026-06-06", estArriveThai: "2026-06-12", status: "ถึงโกดังไทย", pieces: 1, type: "รถ (EK)" }
  ]
};

// 1. API สำหรับดึงข้อมูลพัสดุ (Scraper จาก CNS Cargo)
app.get('/api/track/:trackingNumber', async (req, res) => {
  const trackingNumber = req.params.trackingNumber.trim();

  // จัดการข้อมูลจำลอง (Mock Tracking) สำหรับทดสอบระบบ
  if (trackingNumber.toUpperCase().startsWith('MOCK')) {
    return res.json({
      success: true,
      trackingNumber,
      provider: "Global Cargo Network",
      status: "ถึงโกดังไทย",
      timeline: [
        { date: "2026-06-25 10:30", description: "พัสดุถึงโกดังไทย (กรุงเทพฯ) - รอคัดแยกเพื่อจัดส่งปลายทาง" },
        { date: "2026-06-23 14:15", description: "ผ่านพิธีการศุลกากรไทยเรียบร้อยแล้ว (กำลังนำส่งเข้าคลังสินค้า)" },
        { date: "2026-06-20 09:00", description: "พัสดุถึงด่านตรวจปล่อยไทย (รอกระบวนการทางภาษี)" },
        { date: "2026-06-18 16:45", description: "ตู้สินค้าออกจากท่าเรือ/โกดังจีน (กวางโจว)" },
        { date: "2026-06-16 11:20", description: "รับพัสดุเข้าคลังสินค้ากวางโจว (ประเทศจีน) เรียบร้อยแล้ว" }
      ]
    });
  }

  try {
    const targetUrl = `https://cnscargo.com/public/queryresult.html?transportNumber=${encodeURIComponent(trackingNumber)}`;
    
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    const htmlText = $.html();

    // เช็คกรณีไม่พบพัสดุ
    if (htmlText.includes('ไม่พบรายการที่ค้นหา')) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบรหัสพัสดุนี้ในระบบจัดส่งสินค้า'
      });
    }

    const timeline = [];
    
    // ดึงข้อความดิบทั้งหมดของ wuliuinfo และปรับแต่งช่องว่าง
    const rawText = $('.wuliuinfo').text().replace(/\s+/g, ' ').trim();
    
    // รายการสถานะหลัก 8 ขั้นตอนที่อนุญาตให้แสดงผล (พร้อมโครงสร้างคำพ้องสมานคำ)
    const statusMapping = [
      { key: "ถึงโกดังจีน", display: "ถึงโกดังจีน" },
      { key: "ออกจากโกดังจีน", display: "ออกจากโกดังจีน" },
      { key: "ผ่านพิธีศุลกากรจีนเรียบร้อย", display: "ผ่านพิธีศุลกากรจีนเรียบร้อย" },
      { key: "เรืออยู่ระหว่างขนส่ง", display: "เรืออยู่ระหว่างขนส่ง" },
      { key: "รถอยู่ระหว่างขนส่ง", display: "รถอยู่ระหว่างขนส่ง" },
      { key: "อยู่ระหว่างขนส่ง", display: "อยู่ระหว่างขนส่ง" },
      { key: "ถึงด่านไทย รอตรวจปล่อย", display: "ถึงด่านไทย รอตรวจปล่อย" },
      { key: "ถึงด่านไทย รอการตรวจปล่อย", display: "ถึงด่านไทย รอตรวจปล่อย" },
      { key: "ด่านไทยตรวจปล่อย", display: "ด่านไทยตรวจปล่อย" },
      { key: "ผ่านพิธิศุลกากรไทยเรียบร้อย", display: "ผ่านพิธิศุลกากรไทยเรียบร้อย" },
      { key: "ผ่านพิธีศุลกากรไทยเรียบร้อย", display: "ผ่านพิธิศุลกากรไทยเรียบร้อย" },
      { key: "ถึงโกดังไทย", display: "ถึงโกดังไทย" }
    ];

    // ค้นหาตำแหน่งของสถานะหลักในข้อความดิบ
    const matches = [];
    statusMapping.forEach(item => {
      let idx = -1;
      while ((idx = rawText.indexOf(item.key, idx + 1)) !== -1) {
        matches.push({
          item: item,
          index: idx
        });
      }
    });

    // เรียงลำดับจากซ้ายไปขวา (ตามประวัติในข้อความดิบ)
    matches.sort((a, b) => a.index - b.index);

    if (matches.length > 0) {
      for (let i = 0; i < matches.length; i++) {
        // จำกัดขอบเขตของข้อความสำหรับสถานะนั้นๆ เพื่อดึงข้อมูลวันเวลาที่อยู่ใกล้เคียง
        const startRange = Math.max((i === 0) ? 0 : matches[i-1].index + matches[i-1].item.key.length, matches[i].index - 25);
        const endRange = Math.min((i + 1 < matches.length) ? matches[i+1].index : rawText.length, matches[i].index + matches[i].item.key.length + 80);
        let segmentText = rawText.substring(startRange, endRange).trim();

        // ค้นหาข้อความวันที่ในเซกเมนต์
        const datePattern = /(\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}(:\d{2})?)|(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}(:\d{2})?)|(\d{4}-\d{2}-\d{2})|(\d{2}\/\d{2}\/\d{4})/g;
        const dateMatch = segmentText.match(datePattern);
        const date = dateMatch ? dateMatch[0] : "";

        // จัดเตรียมข้อความรายละเอียด (ใช้ชื่อมาตรฐานที่กำหนดไว้)
        let displayDesc = matches[i].item.display;

        // หากมีข้อความคาดการณ์ในวงเล็บ ให้ดึงมาแสดงด้วยเพื่อเป็นประโยชน์แก่ลูกค้า
        const predMatch = segmentText.match(/\(\s*คาดว่าจะถึงโกดังไทย\s*:\s*\d{2}\/\d{2}\/\d{4}\s*\)/);
        if (predMatch) {
          displayDesc += " " + predMatch[0];
        } else {
          const predMatch2 = segmentText.match(/\(\s*คาดว่าจะถึงโกดังไทย\s*:\s*\d{4}-\d{2}-\d{2}\s*\)/);
          if (predMatch2) {
            displayDesc += " " + predMatch2[0];
          }
        }

        // ป้องกันรายการซ้ำ
        if (!timeline.some(item => item.description === displayDesc)) {
          timeline.push({
            date: date || "ไม่ระบุเวลา",
            description: displayDesc
          });
        }
      }
    } else {
      // วิธีสำรองกรณีพิเศษมากๆ: ให้ดึงข้อความทั้งหมดมาเป็นรายการเดียวหากตรวจไม่พบคำสำคัญเลย
      const fallbackText = rawText;
      if (fallbackText) {
        timeline.push({
          date: "ข้อมูลล่าสุด",
          description: fallbackText
        });
      }
    }

    const cleanTimeline = timeline.sort((a, b) => {
      if (a.date === "ไม่ระบุเวลา") return 1;
      if (b.date === "ไม่ระบุเวลา") return -1;
      
      // แปลงวันที่แบบ DD/MM/YYYY ให้เป็น YYYY/MM/DD เพื่อใช้เปรียบเทียบในคลาส Date ได้ถูกต้อง
      let aDateStr = a.date.replace(/-/g, '/');
      let bDateStr = b.date.replace(/-/g, '/');
      const aParts = aDateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      const bParts = bDateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (aParts) {
        aDateStr = `${aParts[3]}/${aParts[2]}/${aParts[1]}${aDateStr.substring(10)}`;
      }
      if (bParts) {
        bDateStr = `${bParts[3]}/${bParts[2]}/${bParts[1]}${bDateStr.substring(10)}`;
      }
      return new Date(bDateStr) - new Date(aDateStr);
    });

    if (cleanTimeline.length === 0) {
      // กรณีมีข้อความสถานะแต่ดึงโครงสร้างไม่ได้ ให้ดึงข้อความทั้งหมดมาแสดง
      const fallbackText = $('.wuliuinfo').text().trim();
      if (fallbackText) {
        cleanTimeline.push({
          date: "ข้อมูลอัปเดตล่าสุด",
          description: fallbackText
        });
      } else {
        return res.status(404).json({
          success: false,
          message: 'พบพัสดุ แต่ไม่มีข้อมูลสถานะการขนส่ง'
        });
      }
    }

    res.json({
      success: true,
      trackingNumber,
      provider: "Global Cargo Network",
      status: cleanTimeline[0]?.description || "อยู่ระหว่างดำเนินการ",
      timeline: cleanTimeline
    });

  } catch (error) {
    console.error("Error scraping tracking info:", error.message);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลจากเว็บขนส่งพันธมิตร'
    });
  }
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
