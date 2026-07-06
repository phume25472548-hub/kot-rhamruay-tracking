document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  lucide.createIcons();

  // 1. FAQ ACCORDION LOGIC
  const faqQuestions = document.querySelectorAll('.faq-question');
  
  faqQuestions.forEach(question => {
    question.addEventListener('click', () => {
      // Toggle active class on header
      question.classList.toggle('active');
      
      // Get answer panel
      const answer = question.nextElementSibling;
      
      // Toggle show class on answer panel
      if (answer) {
        answer.classList.toggle('show');
      }
    });
  });

  // 2. PARCEL TRACKING LOGIC (Scraper trigger)
  const trackInput = document.getElementById('track-number-input');
  const btnTrackSubmit = document.getElementById('btn-track-submit');
  const trackingResultContainer = document.getElementById('tracking-result-container');
  
  const resTrackingNumber = document.getElementById('res-tracking-number');
  const timelineList = document.getElementById('timeline-list');

  function getStatusBadgeClass(status) {
    if (status.includes('ไทย') && !status.includes('ด่าน')) return 'status-badge'; // default badge
    if (status.includes('ด่าน') || status.includes('ตรวจปล่อย')) return 'status-badge'; 
    return 'status-badge';
  }

  async function performTracking() {
    const number = trackInput.value.trim();
    if (!number) {
      alert('กรุณากรอกเลขพัสดุ');
      return;
    }

    btnTrackSubmit.disabled = true;
    btnTrackSubmit.textContent = 'กำลังค้นหา...';

    try {
      const response = await fetch(`/api/track/${encodeURIComponent(number)}`);
      const data = await response.json();

      if (data.success) {
        // Fill data
        resTrackingNumber.textContent = data.trackingNumber;



        // Render timeline
        timelineList.innerHTML = data.timeline.map((item, idx) => `
          <div class="timeline-item ${idx === 0 ? 'active' : ''}">
            <div class="timeline-badge"></div>
            <div class="timeline-date">${item.date}</div>
            <div class="timeline-desc">${item.description}</div>
          </div>
        `).join('');

        trackingResultContainer.style.display = 'block';
        
        // Scroll to results smoothly
        trackingResultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

      } else {
        alert(data.message || 'ไม่พบข้อมูลการนำเข้า');
        trackingResultContainer.style.display = 'none';
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อระบบหลังบ้าน');
      trackingResultContainer.style.display = 'none';
    } finally {
      btnTrackSubmit.disabled = false;
      btnTrackSubmit.textContent = 'ค้นหา';
    }
  }

  btnTrackSubmit.addEventListener('click', performTracking);

  trackInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performTracking();
  });

});
