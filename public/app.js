document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  // 1. FAQ ACCORDION
  document.querySelectorAll('.faq-question').forEach(question => {
    question.addEventListener('click', () => {
      question.classList.toggle('active');
      const answer = question.nextElementSibling;
      if (answer) answer.classList.toggle('show');
    });
  });

  // 2. PARCEL TRACKING
  // Everything from the server is set with textContent, never innerHTML.
  const trackInput = document.getElementById('track-number-input');
  const btnTrackSubmit = document.getElementById('btn-track-submit');
  const resultContainer = document.getElementById('tracking-result-container');
  const cardTemplate = document.getElementById('result-card-template');
  const itemTemplate = document.getElementById('timeline-item-template');

  function renderTimelineItem(step, isLatest) {
    const item = itemTemplate.content.firstElementChild.cloneNode(true);
    if (isLatest) item.classList.add('active');
    item.querySelector('.timeline-date').textContent = step.date || 'ไม่ระบุเวลา';
    item.querySelector('.timeline-desc').textContent = step.description;
    return item;
  }

  function renderResultCard(result) {
    const card = cardTemplate.content.firstElementChild.cloneNode(true);
    card.querySelector('[data-field="number"]').textContent = result.trackingNumber;

    // Not found: the reason. Found: the carrier note from CNS, e.g. the Flash number.
    const messageText = result.found ? result.note : result.message;
    if (messageText) {
      const message = card.querySelector('[data-field="message"]');
      message.textContent = messageText;
      message.hidden = false;
    }

    if (result.found) {
      const timeline = card.querySelector('[data-field="timeline"]');
      result.timeline.forEach((step, idx) => timeline.appendChild(renderTimelineItem(step, idx === 0)));
    } else {
      card.querySelector('.timeline-box').remove();
    }
    return card;
  }

  async function performTracking() {
    const input = trackInput.value.trim();
    if (!input) {
      alert('กรุณากรอกเลขพัสดุ');
      return;
    }

    btnTrackSubmit.disabled = true;
    btnTrackSubmit.textContent = 'กำลังค้นหา...';

    try {
      const response = await fetch(`/api/track/${encodeURIComponent(input)}`);
      const data = await response.json();

      if (!data.success) {
        alert(data.message || 'ไม่พบข้อมูลการนำเข้า');
        resultContainer.style.display = 'none';
        return;
      }

      resultContainer.replaceChildren(...data.results.map(renderResultCard));
      resultContainer.style.display = 'block';
      resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อระบบหลังบ้าน');
      resultContainer.style.display = 'none';
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
