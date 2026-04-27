/**
 * utils.js - Shared utilities (mock data loader, captcha, countdown)
 */

function useUtils() {
  const { ref, nextTick } = Vue;

  // ---- Mock Data Loader ----
  async function loadJSON(filename) {
    try {
      const res = await fetch('./mock/' + filename);
      if (!res.ok) {
        console.warn('Failed to fetch ' + filename + ': ' + res.status);
        return null;
      }
      const json = await res.json();
      return json?.data ?? json;
    } catch (e) {
      console.warn('Failed to load ' + filename, e);
      return null;
    }
  }

  // ---- Captcha ----
  const captchaCanvas = ref(null);
  const captchaText = ref('');

  function refreshCaptcha() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let text = '';
    for (let i = 0; i < 4; i++) text += chars[Math.floor(Math.random() * chars.length)];
    captchaText.value = text;
    nextTick(() => {
      const canvas = captchaCanvas.value;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 120, 40);
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, 120, 40);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * 120, Math.random() * 40);
        ctx.lineTo(Math.random() * 120, Math.random() * 40);
        ctx.strokeStyle = `hsl(${Math.random() * 360},50%,70%)`;
        ctx.stroke();
      }
      ctx.font = 'bold 24px Arial';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < text.length; i++) {
        ctx.fillStyle = `hsl(${Math.random() * 360},60%,40%)`;
        ctx.save();
        ctx.translate(18 + i * 26, 20);
        ctx.rotate((Math.random() - 0.5) * 0.4);
        ctx.fillText(text[i], 0, 0);
        ctx.restore();
      }
    });
  }

  // ---- Countdown ----
  function getCountdown(turn) {
    if (!turn.endTime) return '';
    const end = new Date(turn.endTime.replace(' ', 'T'));
    const now = new Date();
    const diff = end - now;
    if (diff <= 0) return '已结束';
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${days}天 ${hours}时 ${mins}分 后结束选课`;
  }

  return {
    loadJSON,
    captchaCanvas, captchaText, refreshCaptcha,
    getCountdown,
  };
}
